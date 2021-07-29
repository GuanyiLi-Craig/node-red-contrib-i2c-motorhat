module.exports = function(RED) {
    "use strict";
    const  I2C = require("i2c-bus");

    // The Scan Node
    function I2CScanNode(n) {
        RED.nodes.createNode(this, n);
        this.busno = isNaN(parseInt(n.busno)) ? 1 : parseInt(n.busno);
        var node = this;

        node.on("input", function(msg) {
            var busno = msg.busno;
            if (isNaN(busno)) busno = node.busno;
            node.bus = I2C.openSync( busno );
            node.bus.scan(function(err, res) {
                // result contains a buffer of bytes
                if (err) {
                    node.error(err, msg);
                } else {
                    node.send([{ payload:res }, null]);
                    res.forEach(function(entry) {
                        node.send([null, { payload:entry, address:entry }]);
                    });
                }
            });
        });

        node.on("close", function() {
            node.bus.closeSync();
        });
    }
    RED.nodes.registerType("i2c motor scan", I2CScanNode);

    // The DC Motor Node
    function I2CDCMotorNode(n) {
        RED.nodes.createNode(this, n);
        // get default values
        var nBusno = n.busno || "1";
        var nAddress = n.address || "96";
        this.busno = parseInt(nBusno);
        this.address = parseInt(nAddress);
        this.bus = I2C.openSync( this.busno );
        
        const pwmDriver = new PWM_Driver(this.address, this.bus);
        const callbackNode = (err) => {
                if (err) { node.error(err, n); }
                else { node.send(n); }
        };
        pwmDriver.init(callbackNode);
        this.motors = [
            new DC_Motor_Driver(pwmDriver, 0),
            new DC_Motor_Driver(pwmDriver, 1),
            new DC_Motor_Driver(pwmDriver, 2),
            new DC_Motor_Driver(pwmDriver, 3)];
        var node = this;
            
        node.on("input", function(msg) {
            const callback = (err) => {
                if (err) { node.error(err, msg); }
                else { node.send(msg); }
            };

            var command = parseInt(msg.command);
            if (isNaN(command)) command = 4;
            var index = parseInt(msg.index);
            if (isNaN(index)) index = 1;
            var speed = parseInt(msg.speed);
            if (isNaN(speed)) speed = 0;
            var runtime = parseInt(msg.runtime);
            if (isNaN(runtime)) runtime = 0;

            this.status({});

            try {
                const motor = node.motors[index-1];
                motor.run(command, callback);
                motor.setSpeed(speed, callback);

                if (runtime > 0)
		            sleep(runtime * 1000).then(() => motor.run(4, callback));
            } catch(err) {
                msg = {};
                msg["cmd"] = command;
                msg["index"] = index;
                msg["speed"] = speed;
                msg["runTime"] = runtime;
                console.log(err);
                this.error(err,msg);
            }
        });

        node.on("close", function() {
            node.bus.closeSync();
        });
    }
    RED.nodes.registerType("i2c DC Motor", I2CDCMotorNode);

    // The Stepper Motor Node
    function I2CStepperMotorNode(n) {
        RED.nodes.createNode(this, n);
        // get default values
        var nBusno = n.busno || "1";
        var nAddress = n.address || "96";
        this.busno = parseInt(nBusno);
        this.address = parseInt(nAddress);
        this.bus = I2C.openSync( this.busno );
        
        const pwmDriver = new PWM_Driver(this.address, this.bus);
        const callbackNode = (err) => {
                if (err) { node.error(err, n); }
                else { node.send(n); }
        };
        pwmDriver.init(callbackNode);
        this.stepperMotors = [
            new Stepper_Motor_Driver(pwmDriver, 0, 200),
            new Stepper_Motor_Driver(pwmDriver, 1, 200)];
        var node = this;
            
        node.on("input", function(msg) {
            const callback = (err) => {
                if (err) { node.error(err, msg); }
                else { node.send(msg); }
            };

            var command = parseInt(msg.command);
            if (isNaN(command)) command = 4;
            var index = parseInt(msg.index);
            if (isNaN(index)) index = 1;
            var speed = parseInt(msg.speed);
            if (isNaN(speed)) speed = 0;
            var step = parseInt(msg.step);
            if (isNaN(step)) step = 0;
            var style = parseInt(msg.style);
            if (isNaN(style)) style = 0;

            this.status({});

            try {
                const stepMotor = node.stepperMotors[index-1];
                stepMotor.setSpeed(speed);
                stepMotor.step(step, command, style, callback);
            } catch(err) {
                msg = {};
                msg["cmd"] = command;
                msg["index"] = index;
                msg["speed"] = speed;
                msg["step"] = step;
                msg["style"] = style;
                console.log(err);
                this.error(err,msg);
            }
        });

        node.on("close", function() {
            node.bus.closeSync();
        });
    }
    RED.nodes.registerType("i2c Stepper Motor", I2CStepperMotorNode);
}

const sleep = (milliseconds) => {
    return new Promise(resolve => setTimeout(resolve, milliseconds))
}

class Stepper_Motor_Driver {
    constructor(pwmDriver, motorIndex, steps) {
        this._MICROSTEPS = 8;
	this._MICROSTEP_CURVE = [0, 50, 98, 142, 180, 212, 236, 250, 255];
        this._FORWARD = 1;
        this._BACKWARD = 2;
        this._BRAKE = 3;
        this._RELEASE = 4;
    
        this._SINGLE = 1;
        this._DOUBLE = 2;
        this._INTERLEAVE = 3;
        this._MICROSTEP = 4;

        this._pwmDriver = pwmDriver;
	this._revSteps = steps;
	this._motorIndex = motorIndex;
	this._secPerStep = 0.1;
	this._steppingCounter = 0;
	this._currentStep = 0;

	if (motorIndex == 0) {
		this._PWMA = 8
		this._AIN2 = 9
		this._AIN1 = 10
		this._PWMB = 13
		this._BIN2 = 12
		this._BIN1 = 11
        } else if (motorIndex == 1) {
		this._PWMA = 2
		this._AIN2 = 3
		this._AIN1 = 4
		this._PWMB = 7
		this._BIN2 = 6
		this._BIN1 = 5
        } else
		throw "MotorHAT Stepper must be between 1 and 2 inclusive";
    }

    init(callback) {
        this._pwmDriver.init(callback);
    }

    setSpeed(rpm) {
        this._secPerStep = 60.0 / (this._revSteps * rpm);
        this._steppingCounter = 0;
    }

    oneStep(command, style, callback) {
        var pwm_a = 255;
        var pwm_b = 255; 

	// first determine what sort of stepping procedure we're up to
	if (style == this._SINGLE) {
            if ((this._currentStep/(this._MICROSTEPS/2)) % 2) {
                // we're at an odd step, weird
                if (command == this._FORWARD)
                    this._currentStep += this._MICROSTEPS/2;
                else
                    this._currentStep -= this._MICROSTEPS/2;
            }
        } else {
		// go to next even step
		if (command == this._FORWARD)
			this._currentStep += this._MICROSTEPS;
		else
			this._currentStep -= this._MICROSTEPS;
        }

	if (style == this._DOUBLE) {
		if (!(this._currentStep/(this._MICROSTEPS/2) % 2)) {
			// we're at an even step, weird
			if (command == this._FORWARD)
				this._currentStep += this._MICROSTEPS/2;
			else
				this._currentStep -= this._MICROSTEPS/2;
        	} else {
			// go to next odd step
			if (command == this._FORWARD)
				this._currentStep += this._MICROSTEPS;
			else
				this._currentStep -= this._MICROSTEPS;
	        }
        }

	if (style == this._INTERLEAVE) {
		if (command == this._FORWARD)
			this._currentStep += this._MICROSTEPS/2;
		else
			this._currentStep -= this._MICROSTEPS/2;
        }

	if (style == this._MICROSTEP) {
		if (command == this._FORWARD)
			this._currentStep += 1;
		else {
			this._currentStep -= 1;

			// go to next 'step' and wrap around
			this._currentStep += this._MICROSTEPS * 4;
			this._currentStep %= this._MICROSTEPS * 4;
			pwm_a = pwm_b = 0;
           	}

		if ((this._currentStep >= 0) && (this._currentStep < this._MICROSTEPS)) {
			pwm_a = this._MICROSTEP_CURVE[this._MICROSTEPS - this._currentStep];
			pwm_b = this._MICROSTEP_CURVE[this._currentStep];
            	} else if ((this._currentStep >= this._MICROSTEPS) && (this._currentStep < this._MICROSTEPS*2)) {
			pwm_a = this._MICROSTEP_CURVE[this._currentStep - this._MICROSTEPS];
			pwm_b = this._MICROSTEP_CURVE[this._MICROSTEPS*2 - this._currentStep];
            	} else if ((this._currentStep >= this._MICROSTEPS*2) && (this._currentStep < this._MICROSTEPS*3)) {
			pwm_a = this._MICROSTEP_CURVE[this._MICROSTEPS*3 - this._currentStep];
			pwm_b = this._MICROSTEP_CURVE[this._currentStep - this._MICROSTEPS*2];
            	} else if ((this._currentStep >= this._MICROSTEPS*3) && (this._currentStep < this._MICROSTEPS*4)) {
			pwm_a = this._MICROSTEP_CURVE[this._currentStep - this._MICROSTEPS*3];
			pwm_b = this._MICROSTEP_CURVE[this._MICROSTEPS*4 - this._currentStep];
        	}
        }

	// go to next 'step' and wrap around
	this._currentStep += this._MICROSTEPS * 4;
	this._currentStep %= this._MICROSTEPS * 4;

	// only really used for microstepping, otherwise always on!
	this._pwmDriver.setPWM(this._PWMA, 0, pwm_a*16, callback);
	this._pwmDriver.setPWM(this._PWMB, 0, pwm_b*16, callback);

	// set up coil energizing!
	var coils = [0, 0, 0, 0]

	if (style == this._MICROSTEP) {
		if ((this._currentStep >= 0) && (this._currentStep < this._MICROSTEPS)) {
			coils = [1, 1, 0, 0];
	        } else if ((this._currentStep >= this._MICROSTEPS) && (this._currentStep < this._MICROSTEPS*2)) {
			coils = [0, 1, 1, 0];
		} else if ((this._currentStep >= this._MICROSTEPS*2) && (this._currentStep < this._MICROSTEPS*3)) {
			coils = [0, 0, 1, 1];
            	} else if ((this._currentStep >= this._MICROSTEPS*3) && (this._currentStep < this._MICROSTEPS*4)) {
			coils = [1, 0, 0, 1];
        	}
        } else {
		var step2coils = [ 	[1, 0, 0, 0], 
				[1, 1, 0, 0],
				[0, 1, 0, 0],
				[0, 1, 1, 0],
				[0, 0, 1, 0],
				[0, 0, 1, 1],
				[0, 0, 0, 1],
				[1, 0, 0, 1] ];
		coils = step2coils[Math.floor(this._currentStep/(this._MICROSTEPS/2))];
        }

	// print "coils state = " + str(coils)
	this.setPin(this._AIN2, coils[0], callback);
	this.setPin(this._BIN1, coils[1], callback);
	this.setPin(this._AIN1, coils[2], callback);
	this.setPin(this._BIN2, coils[3], callback);

	return this._currentStep
    }

    step(steps, command, stepStyle, callback) {
        var secPerStep = this._secPerStep;
	var latestStep = 0;
		
	if (stepStyle == this._INTERLEAVE)
		secPerStep = secPerStep / 2.0;
	if (stepStyle == this._MICROSTEP) {
		secPerStep /= this._MICROSTEPS;
		steps *= this._MICROSTEPS;
		console.log(secPerStep , " sec per step");
        }

	for(var i = 0; i < steps; i++) {
		latestStep = this.oneStep(command, stepStyle, callback);
		sleep(secPerStep * 1000).then(() => console.log("Sleep"));
        }
	if (stepStyle == this._MICROSTEP) {
		// this is an edge case, if we are in between full steps, lets just keep going
		// so we end on a full step
		while((lateststep != 0) && (lateststep != this._MICROSTEPS)) {
			lateststep = this.oneStep(command, stepStyle, callback);
			sleep(secPerStep * 1000).then(() => console.log("Sleep"));
            }
        }
    }

    setPin(pin, value, callback) {

        if (pin < 0 || pin > 15)
            throw "PWM pin must be between 0 and 15 inclusive";

        if (value != 0 && value != 1)
            throw "Pin value must be 0 or 1!";

        if (value == 0)
            this._pwmDriver.setPWM(pin, 0, 4096, callback);

        if (value == 1)
            this._pwmDriver.setPWM(pin, 4096, 0, callback);
    }
}

class DC_Motor_Driver {
    constructor(pwmDriver, motorIndex) {
        this._FORWARD = 1;
        this._BACKWARD = 2;
        this._BRAKE = 3;
        this._RELEASE = 4;

        this._pwmDriver = pwmDriver;
        this._motorIndex = motorIndex;

        var pwm = 0;
        var in1 = 0;
        var in2 = 0;

        if (motorIndex == 0) {
            pwm = 8;
            in2 = 9;
            in1 = 10;
        } else if (motorIndex == 1) {
            pwm = 13;
            in2 = 12;
            in1 = 11;
        } else if (motorIndex == 2) {
            pwm = 2;
            in2 = 3;
            in1 = 4;
        } else if (motorIndex == 3) {
            pwm = 7;
            in2 = 6;
            in1 = 5;
        } else {
            throw "MotorHAT Motor must be between 1 and 4 inclusive";
        }
        this._PWMpin = pwm;
        this._IN1pin = in1;
        this._IN2pin = in2;
    }

    init(callback) {
        //console.log("start init");
        //console.log(callback);
        this._pwmDriver.init(callback);
    }

    run(command, callback) {
        if (this._pwmDriver == null)
            return;

        if (command == this._FORWARD) {
            this.setPin(this._IN2pin, 0, callback)
            this.setPin(this._IN1pin, 1, callback)
        }
        if (command == this._BACKWARD) {
            this.setPin(this._IN1pin, 0, callback)
            this.setPin(this._IN2pin, 1, callback)
        }
        if (command == this._RELEASE) {
            this.setPin(this._IN1pin, 0, callback)
            this.setPin(this._IN2pin, 0, callback)
        }
    }

    setSpeed(speed, callback) {
        if (speed < 0)
            speed = 0;

        if (speed > 255)
            speed = 255;
        console.log("set speed " + speed);
        this._pwmDriver.setPWM(this._PWMpin, 0, speed*16, callback);
    }

    setPin(pin, value, callback) {

        if (pin < 0 || pin > 15)
            throw "PWM pin must be between 0 and 15 inclusive";

        if (value != 0 && value != 1)
            throw "Pin value must be 0 or 1!";

        if (value == 0)
            this._pwmDriver.setPWM(pin, 0, 4096, callback);

        if (value == 1)
            this._pwmDriver.setPWM(pin, 4096, 0, callback);
    }

}

class PWM_Driver {

    constructor(address, bus, callback) {
        this._MODE1              = 0x00;
        this._MODE2              = 0x01;
        this._SUBADR1            = 0x02;
        this._SUBADR2            = 0x03;
        this._SUBADR3            = 0x04;
        this._PRESCALE           = 0xFE;
        this._LED0_ON_L          = 0x06;
        this._LED0_ON_H          = 0x07;
        this._LED0_OFF_L         = 0x08;
        this._LED0_OFF_H         = 0x09;
        this._ALL_LED_ON_L       = 0xFA;
        this._ALL_LED_ON_H       = 0xFB;
        this._ALL_LED_OFF_L      = 0xFC;
        this._ALL_LED_OFF_H      = 0xFD;
    
        // Bits
        this._RESTART            = 0x80;
        this._SLEEP              = 0x10;
        this._ALLCALL            = 0x01;
        this._INVRT              = 0x10;
        this._OUTDRV             = 0x04;

        // node
        this._address            = address;
        this._bus                = bus;
    }

    write8(command, value, callback) {
        // Writes an 8-bit value to the specified register/address
        try {
            this._bus.writeByte(this._address, command, value, callback);
        } catch(err) {
            throw command + " - " + value + " - " + err.message;
        }
    }

    softwareReset(address) {
        //Sends a software reset (SWRST) command to all the servo drivers on the bus
        this._sendByte(address, 0x06)        // SWRST
    }
  
    init(callback) {
        this.setAllPWM(0, 0, callback);
        this.write8(this._MODE2, this._OUTDRV, callback);
        this.write8(this._MODE1, this._ALLCALL, callback);
        sleep(5).then(() => console.log("wait 5 ms"));                             // wait for oscillator   
        var mode1 = this._bus.readByte(this._address, this._MODE1, callback);
        mode1 = mode1 & ~this._SLEEP;         // wake up (reset sleep)
        this.write8(this._MODE1, mode1, callback);
        sleep(5).then(() => console.log("wait 5 ms"));                             // wait for oscillator
    }
  
    setPWMFreq(freq, callback) {
        //Sets the PWM frequency
        var prescaleval = 25000000.0;    // 25MHz
        prescaleval /= 4096.0;           // 12-bit
        prescaleval /= float(freq);
        prescaleval -= 1.0;

        var prescale = math.floor(prescaleval + 0.5);
    
        var oldmode = this._bus.readByte(this._address, this._MODE1);
        var newmode = (oldmode & 0x7F) | 0x10;         // sleep
        this.write8(this._MODE1, newmode, callback);  // go to sleep
        this.write8(this._PRESCALE, int(math.floor(prescale)), callback);
        this.write8(this._MODE1, oldmode, callback);
        sleep(5).then(() => console.log("wait 5 ms"));
        this.write8(this._MODE1, oldmode | 0x80, callback);
    }
  
    setPWM(channel, on, off, callback) {
        //Sets a single PWM channel
        this.write8(this._LED0_ON_L + 4*channel, on & 0xFF, callback);
        this.write8(this._LED0_ON_H + 4*channel, on >> 8, callback);
        this.write8(this._LED0_OFF_L + 4*channel, off & 0xFF, callback);
        this.write8(this._LED0_OFF_H + 4*channel, off >> 8, callback);
    }
  
    setAllPWM(on, off, callback) {
        // Sets a all PWM channels
        this.write8(this._ALL_LED_ON_L, on & 0xFF, callback);
        this.write8(this._ALL_LED_ON_H, on >> 8, callback);
        this.write8(this._ALL_LED_OFF_L, off & 0xFF, callback);
        this.write8(this._ALL_LED_OFF_H, off >> 8, callback);
    }
}
