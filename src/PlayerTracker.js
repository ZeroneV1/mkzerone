// zeronev1/mkzerone/mkzerone-aa8731a073a0f42394b89a2c06e05a7169fad598/src/PlayerTracker.js
var Packet = require('./packet');
var Vec2 = require('./modules/Vec2');
var BinaryWriter = require("./packet/BinaryWriter");

function PlayerTracker(gameServer, socket) {
    this.gameServer = gameServer;
    this.socket = socket;
    this.pID = -1;
    this.userAuth = null;
    this.isRemoved = false;
    this.isCloseRequested = false;
    this._name = "";
    this._skin = "";
    this._nameUtf8 = null;
    this._skinUtf8protocol11 = null;
    this._nameUnicode = null;
    this._skinUtf8 = null;
    this.color = { r: 0, g: 0, b: 0 };
    this.viewNodes = [];
    this.clientNodes = [];
    this.cells = [];
    this.mergeOverride = false; 
    this._score = 0; 
    this._scale = 1;
    this.borderCounter = 0;
    this.connectedTime = new Date();

    this.tickLeaderboard = 0;
    this.team = 0;
    this.spectate = false;       
    this.freeRoam = false;       
    this.spectateTarget = null;  
    this.lastKeypressTick = 0;   

    this.centerPos = new Vec2(0, 0);
    this.mouse = new Vec2(0, 0);   
    this.viewBox = {
        minx: 0,
        miny: 0,
        maxx: 0,
        maxy: 0
    };

    this.scrambleX = 0;
    this.scrambleY = 0;
    this.scrambleId = 0;
    this.isMinion = false;
    this.isMuted = false;

    this.spawnmass = 0;
    this.frozen = false;
    this.customspeed = 0;
    this.rec = false;

    this.miQ = 0;
    this.isMi = false;
    this.minionSplit = false;
    this.minionEject = false;
    this.minionFrozen = false;
    this.minionControl = false;
    this.collectPellets = false;

    if (gameServer) {
        this.pID = gameServer.lastPlayerId++ >> 0;
        gameServer.gameMode.onPlayerInit(this);
        this.scramble();
    }
    var UserRoleEnum = require("./enum/UserRoleEnum");
    this.userRole = UserRoleEnum.GUEST;
}

module.exports = PlayerTracker;

PlayerTracker.prototype.scramble = function() {
    if (!this.gameServer.config.serverScrambleLevel) {
        this.scrambleId = 0;
        this.scrambleX = 0;
        this.scrambleY = 0;
    } else {
        this.scrambleId = (Math.random() * 0xFFFFFFFF) >>> 0;
        var maxx = Math.max(0, 31767 - this.gameServer.border.width);
        var maxy = Math.max(0, 31767 - this.gameServer.border.height);
        var x = maxx * Math.random();
        var y = maxy * Math.random();
        if (Math.random() >= 0.5) x = -x;
        if (Math.random() >= 0.5) y = -y;
        this.scrambleX = x;
        this.scrambleY = y;
    }
    this.borderCounter = 0;
};

PlayerTracker.prototype.setName = function(name) {
    this._name = name;
    var writer = new BinaryWriter()
    writer.writeStringZeroUnicode(name);
    this._nameUnicode = writer.toBuffer();
    writer = new BinaryWriter();
    writer.writeStringZeroUtf8(name);
    this._nameUtf8 = writer.toBuffer();
};

PlayerTracker.prototype.setSkin = function(skin) {
    this._skin = skin;
    var writer = new BinaryWriter();
    writer.writeStringZeroUtf8(skin);
    this._skinUtf8 = writer.toBuffer();
    var writer1 = new BinaryWriter();
    writer1.writeStringZeroUtf8("%" + skin);
    this._skinUtf8protocol11 = writer1.toBuffer();
};

PlayerTracker.prototype.getScale = function() {
    this._score = 0; 
    var scale = 0; 
    for (var i = 0; i < this.cells.length; i++) {
        if (!this.cells[i]) continue; 
        scale += this.cells[i]._size;
        this._score += this.cells[i]._mass;
    }
    if (!scale || this.cells.length === 0) { 
      if (this.spectate) return this.gameServer.config.serverSpectatorScale; 
      return this._score = 0.4; 
    }
    return this._scale = Math.pow(Math.min(64 / scale, 1), 0.4);
};

PlayerTracker.prototype.joinGame = function(name, skin) {
    if (this.cells.length > 0 && !this.spectate) return; 

    if (skin) this.setSkin(skin);
    if (!name) name = "An unnamed cell";
    this.setName(name);
    
    this.spectate = false; 
    this.freeRoam = false;
    this.spectateTarget = null;
    this.cells = []; 

    var packetHandler = this.socket.packetHandler;

    if (!this.isMi && this.socket.isConnected != null) {
        if (packetHandler.protocol < 6) {
            packetHandler.sendPacket(new Packet.UpdateNodes(this, [], [], [], this.clientNodes));
        }
        packetHandler.sendPacket(new Packet.ClearAll());
        this.clientNodes = [];
        this.scramble();
        if (this.gameServer.config.serverScrambleLevel < 2) {
            packetHandler.sendPacket(new Packet.SetBorder(this, this.gameServer.border));
        } else if (this.gameServer.config.serverScrambleLevel == 3) {
            var ran = 10065536 * Math.random();
            var border = {
                minx: this.gameServer.border.minx - ran,
                miny: this.gameServer.border.miny - ran,
                maxx: this.gameServer.border.maxx + ran,
                maxy: this.gameServer.border.maxy + ran
            };
            packetHandler.sendPacket(new Packet.SetBorder(this, border));
        }
    }
    this.gameServer.gameMode.onPlayerSpawn(this.gameServer, this);
};

PlayerTracker.prototype.checkConnection = function() {
    if (!this.socket.isConnected) {
        var pt = this.gameServer.config.playerDisconnectTime;
        var dt = (this.gameServer.stepDateTime - this.socket.closeTime) / 1e3;
        if (pt >= 0 && (!this.cells.length || dt >= pt)) { 
            while (this.cells.length > 0) {
                this.gameServer.removeNode(this.cells[0]);
            }
        }
        if ( (pt>=0 && dt >= pt) || (pt < 0 && this.cells.length === 0 && !this.socket.isConnected) ){
            this.isRemoved = true; 
        }

        this.mouse = null;
        if (this.socket.packetHandler) { // Ensure packetHandler exists
            this.socket.packetHandler.pressSpace = false;
            this.socket.packetHandler.pressQ = false;
            this.socket.packetHandler.pressW = false;
        }
        return;
    }

    if (!this.isCloseRequested && this.gameServer.config.serverTimeout) {
        var dt = (this.gameServer.stepDateTime - this.socket.lastAliveTime) / 1000;
        if (dt >= this.gameServer.config.serverTimeout) {
            this.socket.close(1000, "Connection timeout");
            this.isCloseRequested = true;
        }
    }
};

PlayerTracker.prototype.updateTick = function() {
    if (this.isRemoved || this.isMinion) return;
    
    if (this.socket.packetHandler) {
        this.socket.packetHandler.process(); 
    }
    
    if (this.isMi) return; 

    this.updateSpecView(this.cells.length); 

    if (!this.spectate || (this.spectate && this.getSpecTarget() && !this.freeRoam)) {
        var scale = Math.max(this.getScale(), this.gameServer.config.serverMinScale);
        var halfWidth = (this.gameServer.config.serverViewBaseX + 100) / scale / 2;
        var halfHeight = (this.gameServer.config.serverViewBaseY + 100) / scale / 2;
        this.viewBox = {
            minx: this.centerPos.x - halfWidth,
            miny: this.centerPos.y - halfHeight,
            maxx: this.centerPos.x + halfWidth,
            maxy: this.centerPos.y + halfHeight
        };
    } else if (this.spectate && (this.freeRoam || !this.getSpecTarget())) {
        var scale = this.gameServer.config.serverSpectatorScale; 
        var halfWidth = (this.gameServer.config.serverViewBaseX + 100) / scale / 2;
        var halfHeight = (this.gameServer.config.serverViewBaseY + 100) / scale / 2;
         this.viewBox = {
            minx: this.centerPos.x - halfWidth,
            miny: this.centerPos.y - halfHeight,
            maxx: this.centerPos.x + halfWidth,
            maxy: this.centerPos.y + halfHeight
        };
    }
    
    this.viewNodes = [];
    var self = this;
    this.gameServer.quadTree.find(this.viewBox, function(check) {
        if (check) self.viewNodes.push(check); // Ensure check is not null/undefined
    });
    this.viewNodes.sort(function(a, b) { return a.nodeId - b.nodeId; });
};

PlayerTracker.prototype.sendUpdate = function() {
    if (this.isRemoved || !this.socket.packetHandler || !this.socket.packetHandler.protocol ||
        !this.socket.isConnected || this.isMi || this.isMinion ||
        (this.socket._socket && this.socket._socket.writable != null && !this.socket._socket.writable) ||
        (this.socket.readyState != null && this.socket.OPEN != null && this.socket.readyState != this.socket.OPEN ) ) { 
        return;
    }

    var packetHandler = this.socket.packetHandler;
    if (this.gameServer.config.serverScrambleLevel == 2) {
        if (!this.borderCounter) {
            var b = this.gameServer.border, v = this.viewBox;
            var viewWidth = v.maxx - v.minx;
            var viewHeight = v.maxy - v.miny;
             var bound = { 
                minx: Math.max(b.minx, v.minx - viewWidth / 2),
                miny: Math.max(b.miny, v.miny - viewHeight / 2),
                maxx: Math.min(b.maxx, v.maxx + viewWidth / 2),
                maxy: Math.min(b.maxy, v.maxy + viewHeight / 2)
            };
            packetHandler.sendPacket(new Packet.SetBorder(this, bound));
        }
        if (++this.borderCounter >= 20) this.borderCounter = 0;
    }

    var delNodes = [], eatNodes = [], addNodes = [], updNodes = [];
    var oldIndex = 0, newIndex = 0;
    for (; newIndex < this.viewNodes.length && oldIndex < this.clientNodes.length;) {
        if(!this.viewNodes[newIndex] || !this.clientNodes[oldIndex]) break; // Safety break
        if (this.viewNodes[newIndex].nodeId < this.clientNodes[oldIndex].nodeId) {
            if (!this.viewNodes[newIndex].isRemoved) addNodes.push(this.viewNodes[newIndex]);
            newIndex++; continue;
        }
        if (this.viewNodes[newIndex].nodeId > this.clientNodes[oldIndex].nodeId) {
            var node = this.clientNodes[oldIndex];
            if (node.isRemoved) eatNodes.push(node); else delNodes.push(node);
            oldIndex++; continue;
        }
        var node = this.viewNodes[newIndex];
        if (!node.isRemoved) {
             if (node.isMoving || node.cellType == 0 || node.cellType == 2 || (this.gameServer.config.serverGamemode == 3 && node.cellType == 1))
                updNodes.push(node);
        }
        newIndex++; oldIndex++;
    }
    for (; newIndex < this.viewNodes.length;) {
        if(this.viewNodes[newIndex] && !this.viewNodes[newIndex].isRemoved) addNodes.push(this.viewNodes[newIndex]);
        newIndex++;
    }
    for (; oldIndex < this.clientNodes.length;) {
        var node = this.clientNodes[oldIndex];
        if (node && node.isRemoved) eatNodes.push(node); else if (node) delNodes.push(node);
        oldIndex++;
    }
    this.clientNodes = this.viewNodes.filter(node => node && !node.isRemoved); // Keep only valid nodes

    if (addNodes.length || updNodes.length || eatNodes.length || delNodes.length) {
        packetHandler.sendPacket(new Packet.UpdateNodes(this, addNodes, updNodes, eatNodes, delNodes));
    }

    if (++this.tickLeaderboard > 25) {
        this.tickLeaderboard = 0;
        if (this.gameServer.leaderboardType >= 0)
            packetHandler.sendPacket(new Packet.UpdateLeaderboard(this, this.gameServer.leaderboard, this.gameServer.leaderboardType));
    }
};

PlayerTracker.prototype.updateSpecView = function(playerCellCount) {
    if (!this.spectate || playerCellCount > 0) {
        if (playerCellCount > 0) {
            var cx = 0, cy = 0;
            var validCells = 0;
            for (var i = 0; i < playerCellCount; i++) {
                if (this.cells[i] && this.cells[i].position) {
                    cx += this.cells[i].position.x;
                    cy += this.cells[i].position.y;
                    validCells++;
                }
            }
            if (validCells > 0) {
                this.centerPos = new Vec2(cx / validCells, cy / validCells);
            }
        }
    } else { 
        var new_camera_scale; 
        var currentTarget = this.getSpecTarget(); // Renamed to avoid conflict

        if (this.freeRoam || currentTarget == null) {
            if (this.mouse) { 
                 var d = this.mouse.clone().sub(this.centerPos);
                 var dist = d.sqDist(); 
                 if (dist > 0.1) { 
                    this.centerPos.add(d.normalize(), Math.min(dist, this.gameServer.config.serverViewBaseX / 30)); // Speed based on view base
                 }
            }
            new_camera_scale = this.gameServer.config.serverSpectatorScale;
            this.setCenterPos(this.centerPos); 
            // Optionally send a message to client indicating free roam
            // this.gameServer.sendChatMessage(null, this, "[SPEC_INFO]Mode: Free Roam");

        } else {
            this.setCenterPos(currentTarget.centerPos);
            new_camera_scale = currentTarget.getScale();       
            // Optionally send a message to client indicating who they are spectating
            // var targetName = currentTarget._name || "Unnamed Cell";
            // this.gameServer.sendChatMessage(null, this, "[SPEC_INFO]Spectating: " + targetName);
        }

        if (isNaN(new_camera_scale) || new_camera_scale <= 0) {
            new_camera_scale = this.gameServer.config.serverSpectatorScale; 
        }
        
        if (this.socket.packetHandler) { // Ensure packetHandler exists
            this.socket.packetHandler.sendPacket(new Packet.UpdatePosition(
                this, this.centerPos.x, this.centerPos.y, new_camera_scale
            ));
        }
    }
};

PlayerTracker.prototype.pressSpace = function() {
    if (this.spectate) {
        if (this.gameServer.tickCounter - this.lastKeypressTick < 20) return; // Reduced cooldown for faster cycling
        this.lastKeypressTick = this.gameServer.tickCounter;

        if (!this.freeRoam) {
            let potentialTargets = this.gameServer.clients
                .map(socket => socket.playerTracker)
                .filter(pt => pt && pt.cells.length > 0 && pt !== this && pt.socket.isConnected); // Ensure target is connected

            if (potentialTargets.length === 0) {
                this.spectateTarget = null;
                // this.gameServer.sendChatMessage(null, this, "[SPEC_INFO]No players to spectate.");
                return;
            }

            potentialTargets.sort((a, b) => {
                if (b._score !== a._score) {
                    return b._score - a._score;
                }
                return a.pID - b.pID;
            });

            let currentIndex = -1;
            if (this.spectateTarget) {
                currentIndex = potentialTargets.findIndex(pt => pt === this.spectateTarget);
            }

            let nextIndex = (currentIndex + 1) % potentialTargets.length;
            this.spectateTarget = potentialTargets[nextIndex];
            // var targetName = this.spectateTarget._name || "Unnamed Cell";
            // this.gameServer.sendChatMessage(null, this, "[SPEC_INFO]Now spectating: " + targetName);
        }
        // If in freeRoam, space does nothing for now
        
    } else if (this.gameServer.run) {
        if (this.cells.length <= 2) this.mergeOverride = false;
        if (this.mergeOverride || this.frozen) return;
        this.gameServer.splitCells(this);
    }
};

PlayerTracker.prototype.pressW = function() {
    if (this.spectate || !this.gameServer.run) return;
    this.gameServer.ejectMass(this);
};

PlayerTracker.prototype.pressQ = function() {
    if (this.spectate) {
        if (this.gameServer.tickCounter - this.lastKeypressTick < 20) return; // Reduced cooldown
        this.lastKeypressTick = this.gameServer.tickCounter;
        
        this.spectateTarget = null; 
        this.freeRoam = !this.freeRoam; 
        // var mode = this.freeRoam ? "Free Roam" : (this.getSpecTarget() ? (this.getSpecTarget()._name || "Leader") : "Leader");
        // this.gameServer.sendChatMessage(null, this, "[SPEC_INFO]Mode: " + mode);

    }
};

PlayerTracker.prototype.getSpecTarget = function() {
    if (this.spectateTarget && !this.spectateTarget.isRemoved && this.spectateTarget !== this && this.spectateTarget.socket.isConnected) {
        return this.spectateTarget;
    }
    this.spectateTarget = null; 

    if (this.gameServer.largestClient && !this.gameServer.largestClient.isRemoved && this.gameServer.largestClient !== this && this.gameServer.largestClient.socket.isConnected) {
        return this.gameServer.largestClient;
    }
    return null; 
};

PlayerTracker.prototype.setCenterPos = function(p) {
    if (!p || isNaN(p.x) || isNaN(p.y)) { 
        return;
    }
    p.x = Math.max(p.x, this.gameServer.border.minx);
    p.y = Math.max(p.y, this.gameServer.border.miny);
    p.x = Math.min(p.x, this.gameServer.border.maxx);
    p.y = Math.min(p.y, this.gameServer.border.maxy);
    this.centerPos = p;
};