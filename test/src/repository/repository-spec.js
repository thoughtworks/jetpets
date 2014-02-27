require('../../spec-helper.js');

describe('repository', function() {

  it("returns undefined if required without parameter", function() {
    var repository = require(SRC + '/repository/repository.js')();
    assert(repository === undefined);
  });

  it("returns specific implementations", function() {
    var awsImpl = require(SRC + '/repository/repository.js')('aws');
    assert(awsImpl !== undefined);

    var fsImpl = require(SRC + '/repository/repository.js')('fs');
    assert(fsImpl !== undefined);

    awsImpl.should.not.eql(fsImpl);
  });
});
