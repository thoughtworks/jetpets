require('../../spec-helper.js');

describe('playerRepository', function() {

  it("returns undefined if required with wrong config parameter", function() {
    var repository = require(SRC + '/repository/playerRepositoryFactory.js').getInstance({location : 'dropbox'});
    assert(repository === undefined);
  });

  it("returns specific implementations", function() {
    var awsImpl = require(SRC + '/repository/playerRepositoryFactory.js').getInstance({location : 'aws'});
    assert(awsImpl !== undefined);

    var fsImpl = require(SRC + '/repository/playerRepositoryFactory.js').getInstance({location : 'filesystem'});
    assert(fsImpl !== undefined);

    awsImpl.should.not.eql(fsImpl);
  });
});
