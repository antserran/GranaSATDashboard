"use strict"
var SerialPort = require("serialport");
var log = require('../utils/logger.js').Logger;
var logAPRS = require('../utils/logger.js').APRSLogger;
var Promise = require('bluebird');
var leftPad = require('left-pad');


module.exports = function Kenwood(sAddress) {
    var s = new SerialPort(sAddress);
    var APRSBuffer = ""


    s.on('open', function() {
        log("Kenwood TS-2000 serial port opened");
        s.write(Buffer("03", "hex"))
        s.write("TC 0;reset\necho off\n");
    })

    s.on('error', function() {
        log("Unable to open Kenwood TS-2000 serial port");
    })

    function saveAll(data) {
        //TODO: Save APRS and data to the database
        //TODO: Save all to log
        // console.log("APRS raw:" + data.toString());
        APRSBuffer += data;
        if (APRSBuffer.replace(/[\r]/g, "").split("\n") > 1) {
            var aux = APRSBuffer.replace(/[\r]/g, "").split("\n");
            APRSBuffer = aux.pop();
            logAPRS(aux.join("\n"))
            log("APRS data saved")
        }
        // console.log("KENWOOD: " + data.toString().replace(/[\r]/g, "/r"));
    }

    function readFreq(p) {
        var serialBuffer = "";
        return function(data) {
            serialBuffer += data;

            if (serialBuffer.substring(serialBuffer.length - 5, serialBuffer.length) == "TC 0;" && serialBuffer.length > 5) {
                var re = /F([ABC])([0-9]+);/g
                var m = null
                var freq = {};
                do {
                    m = re.exec(serialBuffer);
                    if (m) {
                        freq["VFO" + m[1]] = parseInt(m[2])
                    }
                } while (m);
                p.resolve(freq);
            }

        }
    }

    s.on('data', saveAll);

    function getFrequency(cb) {
        var p = new Promise.defer();

        var f = readFreq(p)
        s.on('data', f);

        s.write("TC 1;FA;FB;FC;TC 0;");

        setTimeout(function() {
            p.resolve({
                error: "Timeout"
            });
        }, 1000);

        p.promise.then(function(data) {
            s.removeListener('data', f);
            cb(data)
        });
    }

    function setFrequency(freq, cb) {

        s.write(Buffer("03", "hex"))
        s.write("TC 1;")

        if (freq.VFOA) {
            var VFOA = leftPad(Math.round(freq.VFOA), 11, 0);
            s.write("FA" + VFOA + ";");
        }
        if (freq.VFOB) {
            var VFOB = leftPad(Math.round(freq.VFOB), 11, 0);
            s.write("FB" + VFOB + ";");
        }
        if (freq.VFOC) {
            var VFOC = leftPad(Math.round(freq.VFOC), 11, 0);
            s.write("FC" + VFOC + ";");
        }
        s.write("TC 0;");
        cb({
            status: "Done"
        });

    }

    return {
        getFrequency: getFrequency,
        setFrequency: setFrequency,
    }
}
