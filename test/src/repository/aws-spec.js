require('../../spec-helper.js');

var rewire = require("rewire");

var repository = rewire(SRC + '/repository/aws.js');

describe('aws', function() {

  xit("should load the players from s3", function() {
    //haven't found a solution to testing this properly :-(
    var s3clientMock = "define mock behaviour here"
    repository.__set__("s3client", s3clientMock);
    console.log(repository.__get__("s3client"));
  });

  xit("should save the players to s3");

});
