const UsbSerial = require('./');

let serial = new UsbSerial();
serial.on('data', data => {
  console.log('X', data, data.toString());
});
serial.on('ready', () => {
  serial.send(new Buffer('Hello! This is a test for 75 baud which should be pretty slow'));
});
