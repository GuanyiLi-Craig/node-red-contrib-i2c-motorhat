# node-red-contrib-i2c-motorhat
Node-red nodes communicate with the Raspberry Pi [I2C Motor Hat](https://www.adafruit.com/product/2348)

## Nodes Introduction

### i2c motor scan

Return a list of addresses of i2c devices connected to raspebrry pi.

### i2c DC motor

Node config: 
* Bus Number: default to 1
* Bus Address: default to 96

Node input:
* index
	* motor index, choose from {1,2,3,4}
* speed
	* motor speed, range from [0, 255]
* command
	* 1 - Forward
	* 2 - Backward
	* 3 - Brake
	* 4 - Release
* runtime
	* <0 - Run till Release command
	* >0 - Run for input seconds

example input node - 4th DC motor runs for 2 seconds with 250/255 of full speed and forward direction. 
```javascript
controlMsg = {};

// varialbles
controlMsg["index"] = 4;
controlMsg["speed"] = 250;
controlMsg["command"] = 1;
controlMsg["runtime"] = 2;
return controlMsg;

```


Output:

Error msg.

### i2c Stepper motor

Node config
* Bus Number: default to 1
* Bus Address: default to 96

Node input
* index
	* Stepper index, choose from {1,2}
* speed
	* motor speed
* command
	* 1 - Forward
	* 2 - Backward
	* 3 - Brake
	* 4 - Release
* Style
	* 1 - Single 
	* 2 - Double 
	* 3 - Interleave
	* 4 - Microstep
* step
	* number of steps

example input node
```javascript
controlMsg = {};

// varialbles
controlMsg["index"] = 2;
controlMsg["speed"] = 120;
controlMsg["step"] = 200;
controlMsg["command"] = 1;
controlMsg["style"] = 2;
return controlMsg;
```
Output:

Error msg. 
