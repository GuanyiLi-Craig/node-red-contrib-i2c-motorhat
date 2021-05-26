module.exports = function(RED) {
    "use strict";
    const  I2C = require("i2c-bus");

    // The Scan Node
    function I2CScanNode(n) {
        RED.nodes.createNode(this, n);
        this.busno = isNaN(parseInt(n.busno)) ? 1 : parseInt(n.busno);
        var node = this;

        node.bus  = I2C.openSync( node.busno );
        node.on("input", function(msg) {
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
    RED.nodes.registerType("i2c scan", I2CScanNode);

    // The Motor Node
    function I2CMotorNode(n) {
        RED.nodes.createNode(this, n);
        this.busno = isNaN(parseInt(n.busno)) ? 1 : parseInt(n.busno);
        this.address = parseInt(n.address);
        this.index = parseInt(n.index);
        this.speed = parseInt(n.speed);
        this.command = parseInt(n.command);
	this.bus = I2C.openSync( this.busno );
        var node = this;
	var msg = n;
        const callback = (err) => {
            if (err) { node.error(err, msg); }
            else { node.send(msg); }
        };
        console.log(callback);
	node.on("input", function(msg) {
            var address = node.address;
            if (isNaN(address)) address = "111";
            var command = node.command;
            if (isNaN(command)) command = "1";

            address = parseInt(address);
            command = parseInt(command);

            if (isNaN(address)) {
                this.status({fill:"red",shape:"ring",text:"Address ("+address+") value is missing or incorrect"});
                return;
            } else {
                this.status({});
            }

            try {
                console.log("create motor object");
		const motor = new DC_Motor_Driver(new PWM_Driver(address, node.bus), node.index);
		console.log("motor object:");
		console.log(motor);
		console.log(callback);
        	motor.init(callback);
                motor.run(command, callback);
                motor.setSpeed(node.speed, callback);
                sleep(2);
            } catch(err) {
		msg = {};
		msg["address"] = address;
		msg["cmd"] = command;
		msg["busno"] = this.busno;
		msg["index"] = this.index;

                this.error(err,msg);
            }
        });

        node.on("close", function() {
            node.bus.closeSync();
        });
    }
    RED.nodes.registerType("i2c DC Motor", I2CMotorNode);
}

const sleep = (milliseconds) => {
    return new Promise(resolve => setTimeout(resolve, milliseconds))
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
	console.log("start init");
	console.log(callback);
        this._pwmDriver.init(callback);
    }

    run(command, callback) {
        if (this._pwmDriver == null)
            return;

        if (command == this.FORWARD) {
            this.setPin(this.IN2pin, 0, callback)
            this.setPin(this.IN1pin, 1, callback)
        }
        if (command == this.BACKWARD) {
            this.setPin(this.IN1pin, 0, callback)
            this.setPin(this.IN2pin, 1, callback)
        }
        if (command == this.RELEASE) {
            this.setPin(this.IN1pin, 0, callback)
            this.setPin(this.IN2pin, 0, callback)
        }
    }

    setSpeed(speed, callback) {
        if (speed < 0)
            speed = 0;

        if (speed > 255)
            speed = 255;

        self._pwmDriver.setPWM(self.PWMpin, 0, speed*16, callback);
    }

    setPin(value, callback) {

		if (pin < 0 || pin > 15)
			throw "PWM pin must be between 0 and 15 inclusive";

		if (value != 0 && value != 1)
            throw "Pin value must be 0 or 1!";

		if (value == 0)
			self._pwmDriver.setPWM(pin, 0, 4096, callback);

		if (value == 1)
			self._pwmDriver.setPWM(pin, 4096, 0, callback);
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
	console.log("write 8");
	console.log(callback);
        try {
            this._bus.writeByte(this._address, command, value, callback);
        } catch(err) {
            throw command + " - " + value + " - " + err.message;
        }
	console.log(command + " - " + value);
    }

    softwareReset(address) {
        //Sends a software reset (SWRST) command to all the servo drivers on the bus
        this._sendByte(address, 0x06)        // SWRST
    }
  
    init(callback) {
	console.log("init");
	console.log(callback);
        this.setAllPWM(0, 0, callback);
	console.log("init mode 2");
        this.write8(this._MODE2, this._OUTDRV, callback);
	console.log("init mode 1");
        this.write8(this._MODE1, this._ALLCALL, callback);
        sleep(5);                             // wait for oscillator
        console.log("init set all");     
        var mode1 = this._bus.readByte(this._address, this._MODE1, callback);
        mode1 = mode1 & ~this._SLEEP;         // wake up (reset sleep)
        this.write8(this._MODE1, mode1, callback);
        sleep(5);                             // wait for oscillator
	console.log("init oscillator");
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
        sleep(5);
        this.write8(this._MODE1, oldmode | 0x80, callback);
    }
  
    setPWM(channel, on, off, callback) {
        //Sets a single PWM channel
        this.write8(this._LED0_ON_L+4*channel, on & 0xFF, callback);
        this.write8(this._LED0_ON_H+4*channel, on >> 8, callback);
        this.write8(this._LED0_OFF_L+4*channel, off & 0xFF, callback);
        this.write8(this._LED0_OFF_H+4*channel, off >> 8, callback);
    }
  
    setAllPWM(on, off, callback) {
        // Sets a all PWM channels
	console.log(callback);
        this.write8(this._ALL_LED_ON_L, on & 0xFF, callback);
        this.write8(this._ALL_LED_ON_H, on >> 8 callback);
        this.write8(this._ALL_LED_OFF_L, off & 0xFF, callback);
        this.write8(this._ALL_LED_OFF_H, off >> 8, callback);
    }
}
