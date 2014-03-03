require('../../spec-helper.js');

var rewire = require("rewire");

var repository = rewire(SRC + '/repository/filesystem.js');

describe('filesystem-repository', function () {

  describe('load players', function () {
    var mockFilesystem = function (fileExists, readError, filePayload) {
      repository.__set__("fs", {
        exists: function (path, cb) {
          cb(fileExists);
        },
        readFile: function (path, cb) {
          cb(readError, filePayload);
        }
      });
    };

    it("should callback with the parsed payload if file does exist", function () {
      var playerPayload = 'this is some player data';
      var players = {
        'players': playerPayload
      };

      mockFilesystem(true, null, JSON.stringify(players));

      var callback = sinon.spy();
      repository.loadPlayers(callback);

      assert(callback.calledOnce);
      assert(callback.calledWith(null, playerPayload));

    });

    it("should callback with error if reading file was unsuccessful", function () {
      mockFilesystem(true, "someError", null);

      var callback = sinon.spy();
      repository.loadPlayers(callback);

      assert(callback.calledOnce);
      assert(callback.calledWith("someError"));
    });

    it("should callback with empty players if file does not exist", function () {
      mockFilesystem(false, null, null);

      var callback = sinon.spy();
      repository.loadPlayers(callback);

      assert(callback.calledOnce);
      assert(callback.calledWith(null, []));
    });
  });

  describe('save players', function () {
    var mockFilesystem = function (writeError) {
      repository.__set__("fs", {
        writeFile: function (path, content, cb) {
          cb(writeError);
        }
      });
    };

    it("should callback if writing was successful", function () {
      var playerPayload = 'this is some player data';
      mockFilesystem(null);

      var callback = sinon.spy();
      repository.savePlayers(playerPayload, callback);

      assert(callback.calledOnce);
      assert(callback.calledWith(null));

    });

    it("should still work without passing in a callback", function () {
      var playerPayload = 'this is some player data';
      mockFilesystem(null);

      repository.savePlayers(playerPayload);
    });

    it("should callback the error if writing was not successful", function () {
      var playerPayload = 'this is some player data';
      mockFilesystem("someError");

      var callback = sinon.spy();
      repository.savePlayers(playerPayload, callback);

      assert(callback.calledOnce);
      assert(callback.calledWith("someError"));
    });

  });

});
