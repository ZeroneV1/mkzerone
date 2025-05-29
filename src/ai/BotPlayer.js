// zeronev1/mkzerone/mkzerone-aa8731a073a0f42394b89a2c06e05a7169fad598/src/ai/BotPlayer.js
var PlayerTracker = require('../PlayerTracker');
var Vec2 = require('../modules/Vec2');

function BotPlayer() {
    PlayerTracker.apply(this, Array.prototype.slice.call(arguments));
    this.splitCooldown = 0;
    
    this.threatAwarenessDistance = 700; // How far the bot "sees" a significant player threat.
    this.largerPlayerRepulsionFactor = 3.0; 
    this.closeThreatRepulsionMultiplier = 2.5; 
    this.virusRiskAvoidanceFactor = 2.8; // Slightly increased for more caution when players are near.
    this.virusEatingAggressionFactor = 3.5; // How strongly to go for viruses when no players are nearby.

    this.lastMoveDirection = new Vec2(Math.random() * 2 - 1, Math.random() * 2 - 1).normalize();
}
module.exports = BotPlayer;
BotPlayer.prototype = new PlayerTracker();


BotPlayer.prototype.largest = function (list) {
    if (!list || list.length === 0) return null;
    var sorted = list.valueOf();
    sorted.sort(function (a, b) {
        return b._size - a._size;
    });
    return sorted[0];
};

BotPlayer.prototype.checkConnection = function () {
    if (this.socket.isCloseRequest) {
        while (this.cells.length) {
            this.gameServer.removeNode(this.cells[0]);
        }
        this.isRemoved = true;
        return;
    }
    if (!this.cells.length)
        this.gameServer.gameMode.onPlayerSpawn(this.gameServer, this);
};

BotPlayer.prototype.sendUpdate = function () {
    if (this.splitCooldown > 0) this.splitCooldown--;
    this.decide(this.largest(this.cells));
};

BotPlayer.prototype.decide = function (cell) {
    if (!cell) return;

    var resultVector = new Vec2(0, 0);
    var mySize = cell._size;

    // Determine if other significant (non-teammate) players are nearby
    var otherPlayersNearby = false;
    for (var j = 0; j < this.viewNodes.length; j++) {
        var node = this.viewNodes[j];
        if (node.isRemoved || node.owner === this || node.cellType !== 0) continue;

        var isTeammate = this.gameServer.gameMode.haveTeams && cell.owner && node.owner && cell.owner.team === node.owner.team;
        if (!isTeammate) {
            var distToPlayerCell = Math.sqrt(new Vec2(node.position.x - cell.position.x, node.position.y - cell.position.y).dist());
            // Consider players within a slightly larger radius than threatAwareness for this check, to be safe.
            if (distToPlayerCell < this.threatAwarenessDistance * 1.2) { 
                otherPlayersNearby = true;
                break;
            }
        }
    }

    for (var i = 0; i < this.viewNodes.length; i++) {
        var check = this.viewNodes[i];
        if (check.owner == this || check.isRemoved) continue;

        var influence = 0;
        var displacement = new Vec2(check.position.x - cell.position.x, check.position.y - cell.position.y);
        var distanceSq = Math.max(1, displacement.dist()); 
        var actualDistance = Math.sqrt(distanceSq); 
        var checkSize = check._size;

        switch (check.cellType) {
            case 0: // Player cell (human or other bot)
                if (this.gameServer.gameMode.haveTeams && cell.owner.team == check.owner.team) {
                    influence = 0; 
                } else if (mySize > checkSize * 1.15) { 
                    influence = (checkSize * 2.5) / actualDistance; 
                    if (!this.splitCooldown && this.cells.length < this.gameServer.config.playerMaxCells / 2 &&
                        mySize > checkSize * 2.2 && 
                        actualDistance < mySize / 1.5) { 
                        this.splitCooldown = 20; 
                        this.mouse = check.position.clone();
                        this.socket.packetHandler.pressSpace = true;
                        this.lastMoveDirection = displacement.clone().normalize();
                        return; 
                    }
                } else if (checkSize > mySize * 1.15) { 
                    influence = (-checkSize * this.largerPlayerRepulsionFactor) / actualDistance;
                    if (actualDistance < this.threatAwarenessDistance) {
                        influence *= 1.5; 
                    }
                    if (actualDistance < (mySize + checkSize) * 0.85 ) { 
                        influence *= this.closeThreatRepulsionMultiplier; 
                    }
                } else { 
                    influence = -(checkSize / mySize) / (3 * actualDistance); 
                }
                break;
            case 1: // Food
                influence = (1.5 + (30 / Math.max(mySize,1))) / actualDistance; 
                break;
            case 2: // Virus or MotherCell
                var canPopVirus = this.cells.length < this.gameServer.config.playerMaxCells;

                if (check.isMotherCell) {
                    if (mySize > checkSize * 1.3) { 
                        influence = (checkSize * 0.5) / actualDistance; 
                    } else {
                        influence = (-checkSize * this.virusRiskAvoidanceFactor * 2.0) / actualDistance; 
                    }
                } else { // Regular Virus
                    if (mySize > checkSize * 1.15) { // Bot is larger than virus
                        if (otherPlayersNearby) {
                            // Players ARE nearby: Cautious mode
                            if (!canPopVirus) { // Already at max cells, virus is just food
                                influence = (checkSize * 1.8) / actualDistance; // Moderate attraction
                            } else { // Would pop, and players are near: AVOID STRONGLY
                                influence = (-checkSize * this.virusRiskAvoidanceFactor * 2.5) / actualDistance;
                                if (actualDistance < (mySize + checkSize) * 0.9) influence *= 2.0; // Very strong if about to hit
                            }
                        } else {
                            // NO players are nearby: Aggressive virus eating mode for growth
                            influence = (checkSize * this.virusEatingAggressionFactor) / actualDistance; 
                            if (mySize < 800 && canPopVirus) { 
                                influence *= 1.5; // Even higher desire to pop and grow if small
                            }
                        }
                    } else { // Bot is smaller than virus (shouldn't often happen for standard viruses)
                        influence = (-checkSize * 0.5) / actualDistance; // Default avoid if smaller
                    }
                }
                break;
            case 3: // Ejected mass
                if (mySize > checkSize * 1.15)
                    influence = checkSize / actualDistance;
                break;
        }

        if (influence !== 0) {
            var normDisp = displacement.clone().normalize();
            resultVector.x += normDisp.x * influence;
            resultVector.y += normDisp.y * influence;
        }
    }

    // Border Avoidance Logic
    var borderConfig = this.gameServer.border;
    var pushFromBorderPower = 0.5; 
    var detectionRatio = 0.15; 

    if (cell.position.x < borderConfig.minx + borderConfig.width * detectionRatio) resultVector.x += pushFromBorderPower;
    if (cell.position.x > borderConfig.maxx - borderConfig.width * detectionRatio) resultVector.x -= pushFromBorderPower;
    if (cell.position.y < borderConfig.miny + borderConfig.height * detectionRatio) resultVector.y += pushFromBorderPower;
    if (cell.position.y > borderConfig.maxy - borderConfig.height * detectionRatio) resultVector.y -= pushFromBorderPower;


    if (resultVector.x === 0 && resultVector.y === 0) {
        if (this.lastMoveDirection.x === 0 && this.lastMoveDirection.y === 0) {
            this.lastMoveDirection = new Vec2(Math.random() * 2 - 1, Math.random() * 2 - 1).normalize();
        }
        resultVector = this.lastMoveDirection.clone();
    } else {
         resultVector.normalize(); 
         this.lastMoveDirection = resultVector.clone(); 
    }

    this.mouse = new Vec2(
        cell.position.x + resultVector.x * 800, 
        cell.position.y + resultVector.y * 800
    );
};