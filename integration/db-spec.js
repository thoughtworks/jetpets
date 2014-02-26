require('./spec-helper.js');
var db = require(SRC + '/db.js');

describe('db', function () {

  var testFile = './integrationTest/players.json';

  afterEach(function (done) {
    db.deleteAllPlayers(testFile, done);
  });

  it("can add and retrieve players from AWS", function (done) {
    db.loadPlayers(function (err, list) {
        list.length.should.eql(0);

        var players = [];
        var standardPlayer = {
          id: 1,
          firstName: 'Micky',
          pin: 'somePin',
          topScore: 0,
          lastName: ''
        };
        players.push(standardPlayer);
        var playerWithSpecialChars = {
          id: 1,
          firstName: 'Érvin',
          pin: 'somePin',
          topScore: 0,
          lastName: 'König'
        };
        players.push(playerWithSpecialChars);

        db.savePlayers(
          players,
          testFile,
          function () {
            db.loadPlayers(function (err, list) {
                var players = list;
                list.length.should.eql(2);
                list.should.eql(players);
                done();
              },
              testFile)
          });
      },
      testFile);
  });
});
