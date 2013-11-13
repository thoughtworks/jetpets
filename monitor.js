var forever = require('forever');
var fs = require('fs');

var options = {
  command: 'node',
  silent: false,
  minUptime: 5000,
  spinSleepTime: 500,
  watch: true,
  watchDirectory: './src',
  watchIgnoreDotFiles: true
};

if (!fs.existsSync('./aws.json')) {
  console.error("You'll need 'aws.json'. Grab it from the JetPets group on MyTW.");
  process.exit(1);
}

var aws = require('./aws');
process.env['KEY'] = aws.key;
process.env['SECRET'] = aws.secret;
process.env['BUCKET'] = aws.bucket;

var monitor = new forever.Monitor('server.js', options);

monitor.on('watch:restart', function(info) {
    return console.error("restarting script because " + info.file + " changed");
});

monitor.on('restart', function() {
    return console.error("Forever restarting script for " + monitor.times + " time");
});

monitor.on('exit:code', function(code) {
    return console.error("Forever detected script exited with code " + code);
});

monitor.start();
forever.startServer(monitor);
