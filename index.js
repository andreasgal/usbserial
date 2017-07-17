const assert = require('assert');
const usb = require('usb');
const EventEmitter = require('events');

function findDevices(vid, pid) {
  return usb.getDeviceList()
    .filter(device => device.deviceDescriptor.idVendor === vid &&
            device.deviceDescriptor.idProduct === pid);
}

const SupportedBaudrates = [75, 150, 300, 600, 1200, 1800, 2400, 3600,
	                    4800, 7200, 9600, 14400, 19200, 28800, 38400,
	                    57600, 115200, 230400, 460800, 614400,
	                    921600, 1228800, 2457600, 3000000, 6000000];

// find an endpoint of the given transfer type and direction
function find_ep(iface, transferType, direction) {
  let eps = iface.endpoints.filter(e => e.transferType === transferType && e.direction === direction);
  assert(eps.length === 1);
  return eps[0];
}


function controlTransfer(device, requestType, request, value, index, data_or_length) {
  return new Promise((resolve, reject) => {
    device.controlTransfer(requestType, request, value, index, data_or_length,
                           (err, data) => {
                             if (err) {
                               reject(err);
                               return;
                             }
                             resolve(data);
                           });
  });
}

function vendor_read(device, value, index) {
  return controlTransfer(device, 0xc0, 0x01, value, index, 1)
    .then(buffer => buffer[0]);
}

function vendor_write(device, value, index) {
  return controlTransfer(device, 0x40, 0x01, value, index, new Buffer(0));
}

function setBaudrate(device, baud) {
  assert(baud <= 115200);
  // find the nearest supported bitrate
  let list = SupportedBaudrates.slice().sort((a, b) => Math.abs(a - baud) - Math.abs(b - baud));
  let newBaud = list[0];
  return controlTransfer(device, 0xa1, 0x21, 0, 0, 7)
    .then(data => {
      data.writeInt32LE(newBaud, 0);
      data[4] = 0; // 1 stop bit
      data[5] = 0; // no parity
      data[6] = 8; // 8 bit characters
      return controlTransfer(device, 0x21, 0x20, 0, 0, data);
    })
    .then(() => vendor_write(device, 0x0, 0x0)) // no flow control
    .then(() => vendor_write(device, 8, 0)) // reset upstream data pipes
    .then(() => vendor_write(device, 9, 0));
}

class UsbSerial extends EventEmitter {
  constructor(port) {
    super();
    port = port || 0;
    let devices = findDevices(0x067b, 0x2303);
    assert(devices.length > port);
    let device = devices[port];
    let descriptor = device.deviceDescriptor;
    this.device = device;
    assert(descriptor.bDeviceClass !== 0x02);
    assert(descriptor.bMaxPacketSize0 === 0x40); // HX type
    device.timeout = 100;
    device.open();
    assert(device.interfaces.length === 1);
    let iface = device.interfaces[0];
    iface.claim();
    let int_ep = find_ep(iface, usb.LIBUSB_TRANSFER_TYPE_INTERRUPT, 'in');
    int_ep.on('data', data => {
      this.emit('status', data);
    });
    int_ep.on('error', err => {
      this.emit('error', err);
    });
    int_ep.startPoll();
    let in_ep = find_ep(iface, usb.LIBUSB_TRANSFER_TYPE_BULK, 'in');
    in_ep.on('data', data => {
      this.emit('data', data);
    });
    in_ep.on('error', err => {
      this.emit('error', err);
    });
    let out_ep = find_ep(iface, usb.LIBUSB_TRANSFER_TYPE_BULK, 'out');
    out_ep.on('error', err => {
      this.emit('error', err);
    });
    this.out_ep = out_ep;
    vendor_read(device, 0x8484, 0)
      .then(() => vendor_write(device, 0x0404, 0))
      .then(() => vendor_read(device, 0x8484, 0))
      .then(() => vendor_read(device, 0x8383, 0))
      .then(() => vendor_read(device, 0x8484, 0))
      .then(() => vendor_write(device, 0x0404, 1))
      .then(() => vendor_read(device, 0x8484, 0))
      .then(() => vendor_read(device, 0x8383, 0))
      .then(() => vendor_write(device, 0, 1))
      .then(() => vendor_write(device, 1, 0))
      .then(() => vendor_write(device, 2, 0x44))
      .then(() => setBaudrate(device, 75))
      .then(() => in_ep.startPoll())
      .then(() => this.emit('ready'))
      .catch(err => this.emit('error', err));
  }

  send(data) {
    assert(data instanceof Buffer);
    this.out_ep.transfer(data);
  }
};

let serial = new UsbSerial();
serial.on('data', data => {
  console.log('X', data, data.toString());
});
serial.on('ready', () => {
  serial.send(new Buffer('Hello! This is a test for 75 baud which should be pretty slow'));
});
