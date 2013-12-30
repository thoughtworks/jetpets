require('../spec-helper.js');
var game = require(SRC + '/game.js');
var bridge = require(SRC + '/bridge.js');

function players() {
  return game.getPlayers();
}

describe('game', function() {
  
  beforeEach(function() {
    game.clear();
    sinon.stub(bridge, 'send', function() { /* noop */ });
  });

  afterEach(function() {
    bridge.send.restore();
  });

  it("starts with empty slots", function() {
    players().should.eql([
      {id: null},
      {id: null}
    ]);
  });
  
  it("can add players", function() {
    game.addPlayer({id: '1'});
    players().should.eql([
      {id: '1'},
      {id: null}
    ]);
    game.addPlayer({id: '2'});
    players().should.eql([
      {id: '1'},
      {id: '2'}
    ]);
  });

  it("can't add more than 2 players", function() {
    game.addPlayer({id: '1'});
    game.addPlayer({id: '2'});
    game.addPlayer({id: '3'});
    players().should.eql([
      {id: '1'},
      {id: '2'}
    ]);
  });

  it("can remove players", function() {
    game.addPlayer({id: '1'});
    game.addPlayer({id: '2'});
    game.removePlayer({id: '1'});
    players().should.eql([
      {id: null},
      {id: '2'}
    ]);
    game.removePlayer({id: '2'});
    players().should.eql([
      {id: null},
      {id: null}
    ]);
  });

  it("ignores removing players that aren't in the game", function() {
    game.addPlayer({id: '1'});
    game.addPlayer({id: '2'});
    game.removePlayer({id: '3'});
    players().should.eql([
      {id: '1'},
      {id: '2'}
    ]);
  });

  it("can tell if it's full", function() {
    game.isFull().should.eql(false);
    game.addPlayer({id: '1'});
    game.isFull().should.eql(false);
    game.addPlayer({id: '2'});
    game.isFull().should.eql(true);
  });
  
  it("can tell if a player is in the match", function() {
    game.addPlayer({id: '1'});
    game.hasPlayer({id: '1'}).should.eql(true);
    game.hasPlayer({id: '2'}).should.eql(false);
  });
  
  it("can send actions to the game engine", function() {
    game.addPlayer({id: '1'});
    game.send({id: '1'}, 'up');
    sinon.assert.called(bridge.send);
    bridge.send.lastCall.args[0].should.eql('player-action');
  });
  
  it("ignores actions from invalid players", function() {
    game.addPlayer({id: '1'});
    game.addPlayer({id: '2'});
    bridge.send.reset();
    game.send({id: '3'}, 'up');
    sinon.assert.notCalled(bridge.send);
  });

  it("sends vectors for 'up' and 'down' actions", function() {
    game.addPlayer({id: '1'});
    game.send({id: '1'}, 'up');
    bridge.send.lastCall.args[1].should.eql({ pindex:0, action: 'up' });
    game.send({id: '1'}, 'down');
    bridge.send.lastCall.args[1].should.eql({ pindex:0, action: 'down' });
  });

});
