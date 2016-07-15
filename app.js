"use strict"

// REQUIRES ////////////////////////////////////////////////////////////
//Express stuff
var express = require('express');
var bodyParser = require("body-parser");
var cookieParser = require('cookie-parser');


//Commons
var leftPad = require('left-pad');
var crypto = require('crypto');

//Rotors and transceivers
var Yaesu = require('./rotors/yaesu.js');

//Database stuff
var mysql = require('mysql');
var database = mysql.createConnection({
    host: 'localhost',
    user: 'adminboard',
    password: 'granada2016',
    database: 'dashboard'
});

//Auth stuff
var passport = require('passport');
var LocalStrategy = require('passport-local').Strategy;



// CONF //////////////////////////////////////////////////////////////
var HOST = "0.0.0.0" //Listen to every IP address
var PORT = 8002 //Listening port
var SERIAL_DEVICE = "/dev/ttyUSB0" // Rotors path

// APPs ////////////////////////////////////////////////////////////////
var app = express();
app.use(bodyParser.urlencoded({
    extended: true
}));
app.use(cookieParser());
app.use(require('express-session')({
    secret: '561a1ce41fe5d35e8eb1ad08172c34b437903e8e5a14b80d78815465a46247e4',
    cookie: {
        maxAge: 1800000
    },
    resave: false,
    saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());


//PASSPORTJS AND AUTH/ /////////////////////////////////////////////////
//PASSPORTJS STUFF//

// console.log("pablogs9");
// var salt = createSalt();
// var hashedPassword = hashPassword("pablogs9", salt);
// console.log(salt);
// console.log(hashedPassword);

function log(s) {
    console.log(s);
    //TODO: Save to a file
}

function hashPassword(password, salt) {
    var hash = crypto.createHash('sha256');
    hash.update(password);
    hash.update(salt);
    return hash.digest('hex');
}

function createSalt() {
    var len = 30;
    return crypto.randomBytes(Math.ceil(len * 3 / 4))
        .toString('base64') // convert to base64 format
        .slice(0, len) // return required number of characters
        .replace(/\+/g, '0') // replace '+' with '0'
        .replace(/\//g, '0'); // replace '/' with '0'
}

function isAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    } else {
        res.json({
            status: "Error",
            error: "Logged out"
        })
    }
}

passport.use("login", new LocalStrategy({
    usernameField: 'username',
    passwordField: 'password',
    passReqToCallback: true,
}, function(req, username, password, done) {
    log("Trying to login: " + username + " at " + (req.headers['x-forwarded-for'] || req.connection.remoteAddress));
    database.query('select * from USERS where USER_NAME = ?', username, function(err, rows) {
        if (err) {
            log(err);
            return done(null, false);
        }
        if (rows.length != 0) {
            var user = rows[0];
            var hash = hashPassword(password, user.USER_PASSWORD.split(":")[0]);
            if (hash == user.USER_PASSWORD.split(":")[1]) {
                done(null, user);
            } else {
                return done(null, false);
            }
        } else {
            return done(null, false);
        }
    });
}));

// passport.use('signup', new LocalStrategy({
//     usernameField: 'username',
//     passwordField: 'password'
// }, function(username, password, done) {
//     var salt = createSalt();
//     var hashedPassword = hashPassword(password, salt);
//     db.serialize(function() {
//         db.run("INSERT INTO users (id, username,password,salt,userGroup) VALUES (?,?,?,?,?)", [null, username, hashedPassword, salt, 1], function(err, row) {
//             if (err) {
//                 return done(null, false)
//             } else {
//                 db.get('SELECT username, id FROM users WHERE username = ? AND password = ?', username, hashedPassword, function(err, row) {
//                     if (!row) return done(null, false);
//                     return done(null, row);
//                 });
//             };
//         });
//     });
// }));

passport.serializeUser(function(user, done) {
    return done(null, user.USER_ID);
});

passport.deserializeUser(function(id, done) {
    database.query('select * from USERS where USER_ID = ?', id, function(err, rows) {
        if (rows.length == 0) return done(null, false);
        return done(null, rows[0]);
    });
});

app.post('/login', passport.authenticate('login'), function(req, res) {
    log("Logged: " + req.user.USER_NAME);
    res.json({
        status: "Auth Done"
    })
});

app.get('/logout', function(req, res) {
    req.logout();
    res.json({
        status: "Done"
    })
});

// ROUTES, GET AND POST ////////////////////////////////////////////////
app.get('/radiostation', function(req, res) {
    //Generate a response with radio information (mode, frequecy...)
    res.send('GET RADIOSTATION');
});

app.post('/radiostation', function(req, res) {
    //Set radio information (mode, frequecy...) available on the HTTP request

    var mode = req.param('mode') ;
    var freq = req.param('freq');

    if (mode && freq) {
        res.send(mode + ',' + freq)
    } else {
        res.send('Parámetros no definidos')
    }

});

app.get('/rotors', isAuthenticated, function(req, res) {
    //Generate a response with elevation and azimuth information
    var y = new Yaesu(SERIAL_DEVICE);

    y.getData(function(data) {
        res.json(data);
    })

});

app.post('/rotors', isAuthenticated, function(req, res) {
    //Set the elevation and azimuth information available on the HTTP request

    var elevation = leftPad(parseInt(req.body.ele), 3, 0);
    var azimuth = leftPad(parseInt(req.body.azi), 3, 0);

    log("Seting rotors to " + elevation + "/" + azimuth + "[" + req.user + "]")

    if (elevation != "" && azimuth != "") {
        var SerialPort = require("serialport");
        var s = new SerialPort(SERIAL_DEVICE);
        s.on("open", function() {
                s.write(new Buffer("W" + azimuth + " " + elevation + "\n", "utf8"), function() {
                    res.json({
                        status: "Done"
                    })
                    s.close()
                })
            })
            // var y = new Yaesu(SERIAL_DEVICE);
            // y.open();
            // y.move(elevation, azimuth)
            // res.send('Pos: ' + y.query());
    } else {
        res.json({
            status: "Error"
        })
    }
    var y = new Yaesu(SERIAL_DEVICE);

    y.move(azimuth, elevation, function(data){
        res.json(data);
    })

});

app.get('/*', function(req, res, next) {
    next();
}, function(req, res) {
    res.end();
});

app.listen(PORT, HOST)
