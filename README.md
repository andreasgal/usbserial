# usbserial

Prolific PL2303 USB to serial adapter driver for node.

## API

    const UsbSerial = require('usbserial');

    let serial = new UsbSerial();

    serial.on('data', data => console.log(data));
    serial.on('ready', () => serial.send(new Buffer('Hello!')));
