"use strict";
const async = require('async');
const noble = require('noble');
const querystring = require('querystring');
const http = require('http');
const os = require('os');
const fs = require('fs');

const ruuviParser = require('ruuvi.endpoints.js');

const devices = {
    '00:01:02:03:04:05': 'a',
    '10:11:12:13:14:15': 'b',
    '20:21:22:23:24:25': 'c',
};

const samples = {
    'a': [],
    'b': [],
    'c': [],
};

const samplesPerDevice = 5;
let pendingDevices = 3;

noble.on('stateChange', function(state) {
    if (state === 'poweredOn') {
        console.log('Starting BLE scanning');
        noble.startScanning([], true);
    } else {
        console.log('Error in BLE scanning');
        noble.stopScanning();
        process.exit(1);
    }
});

noble.on('discover', function(peripheral) {
    const advertisement = peripheral.advertisement;

    if (!advertisement.manufacturerData) {
        return;
    }

    const sample = {
        // gateway: os.hostname(),
        timestamp: Date.now(),
        device: peripheralNameFromMacAddress(peripheral.address),
        rssi: peripheral.rssi,
        data: {},
    };

    if (samples[sample.device] && samples[sample.device].length === samplesPerDevice) {
        return;
    }

    const manufacturerDataString = advertisement.manufacturerData.toString('hex').toUpperCase();

    if (!manufacturerDataString.startsWith('9904')) {
        return;
    }

    sample.data = parseManufacturerData(manufacturerDataString.slice(4));

    samples[sample.device].push(sample);

    // console.log(peripheral);
    // console.log(sample);

    const nbSamples = samples[sample.device].length;
    if (nbSamples < samplesPerDevice) {
        console.log('Got '+nbSamples+' / '+samplesPerDevice+' samples for device ' + sample.device);
    } else if (nbSamples === samplesPerDevice) {
        console.log('Got enough samples ('+nbSamples+' / '+samplesPerDevice+') for device ' + sample.device);

        pendingDevices = pendingDevices - 1;
        if (pendingDevices === 0) {
            done();
        }
    }
});

function peripheralNameFromMacAddress(macAddress) {
    if (devices[macAddress]) {
        return devices[macAddress];
    }

    return macAddress;
}

function parseManufacturerData(dataString) {
    let binary = hexStringToByte(dataString);

    // Skip non-broadcast types
    if (binary[0] < 2 || binary[0] > 5 || binary.size < 10) {
        return null;
    }

    const data = ruuviParser.parse(binary);

    return data;
}

function done() {
    console.log('Got enough samples for all devices, exiting');

    fs.writeFileSync('./samples.json', JSON.stringify(samples));

    process.exit(0);
}

// https://gist.github.com/tauzen/3d18825ae41ff3fc8981
const byteToHexString = function(uint8arr) {
    if (!uint8arr) {
        return '';
    }

    var hexStr = '';
    for (var i = 0; i < uint8arr.length; i++) {
        var hex = (uint8arr[i] & 0xff).toString(16);
        hex = (hex.length === 1) ? '0' + hex : hex;
        hexStr += hex;
    }

    return hexStr.toUpperCase();
}

const hexStringToByte = function(str) {
    if (!str) {
        return new Uint8Array();
    }

    var a = [];
    for (var i = 0, len = str.length; i < len; i += 2) {
        a.push(parseInt(str.substr(i, 2), 16));
    }

    return new Uint8Array(a);
}

setTimeout(() => {
    console.log('Timeout, exiting');

    fs.writeFileSync('./samples.json', JSON.stringify(samples));

    process.exit(2);
}, 3*60*1000);

process
.on('unhandledRejection', (reason, p) => {
    console.error(reason, 'Unhandled Rejection at Promise', p);
})
.on('uncaughtException', err => {
    console.error(err, 'Uncaught Exception thrown');
    // process.exit(1);
});
