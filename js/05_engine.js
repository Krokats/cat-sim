/**
 * Moonkin Simulation - File 5: Simulation Engine & Math
 */

// ============================================================================
// CORE SIMULATION WRAPPERS
// ============================================================================

function getInputs() {
    if(!document.getElementById("calcMethod")) return { mode: "S", stats: {}, power: {}, enemy: {}, gear: {}, talents: {}, rota: {} };
    var m = document.getElementById("calcMethod").value;
    var rawSims = getVal("simCount");
    var hitBonus = getVal("statHit");
    var lvl = getVal("enemy_level");
    var baseHit = 0.96; 
    if(lvl == 61) baseHit = 0.95;
    if(lvl == 62) baseHit = 0.94;
    if(lvl == 63) baseHit = 0.83; 
    var finalHitChance = Math.min(0.99, baseHit + (hitBonus / 100));
    var stratEl = document.getElementById("trinket_strat");
    var strat = stratEl ? stratEl.value : "START";

    return {
        mode: m, iterations: (m.startsWith("D")) ? 1 : (rawSims > 0 ? rawSims : 1), maxTime: getVal("maxTime"), avcd: getVal("avcd") / 1000,
        rota: { 
            castIS: getVal("rota_is"), castMF: getVal("rota_mf"), 
            castSF: getVal("rota_starfire"), castW: getVal("rota_wrath"),
            eclDOT: getVal("rota_eclDot"), spellInterrupt: getVal("rota_interrupt"), 
            fishMeth: getVal("rota_fish"), startBoat: getVal("start_boat"), wrathFlight: getVal("wrath_flight") 
        },
        stats: { hit: finalHitChance, hitBonus: hitBonus, crit: getVal("statCrit"), haste: getVal("statHaste"), baseHitProb: baseHit },
        power: { sp: getVal("sp_gen"), nat: getVal("sp_nature"), arc: getVal("sp_arcane"), pen: getVal("sp_pen") },
        enemy: { resNat: getVal("res_nature"), resArc: getVal("res_arcane"), cos: getVal("enemy_cos"), level: lvl },
        gear: { t3_4p: getVal("t3_4p"), t3_6p: getVal("t3_6p"), t3_8p: getVal("t3_8p"), t35_5p: getVal("t35_5p"), idolEoF: getVal("idolEoF"), idolMoon: getVal("idolMoon"), idolProp: getVal("idolProp"), idolMoonfang: getVal("idolMoonfang"), binding: getVal("item_binding"), scythe: getVal("item_scythe"), scythe_use: getVal("item_scythe_use"), sulfuras: getVal("item_sulfuras"), woc: getVal("item_woc"), reos: getVal("item_reos"), toep: getVal("item_toep"), roop: getVal("item_roop"), zhc: getVal("item_zhc"), trinket_strat: strat },
        talents: { nEProc: 50, aEProc: 30, onCrit: false, neDuration: 15.0, aeDuration: 15.0, neICD: 30.0, aeICD: 30.0, boatReduc: getVal("t35_5p") ? 0.665 : 0.5, boatChance: 0.30, ooc: 1, boon: 1 }
    };
}

function runSimulation() {
    showProgress("Simulating...");
    var wRes = document.getElementById("weightResults");
    if(wRes) wRes.classList.add("hidden");
    
    setTimeout(function() {
        try {
            updateProgress(50);
            setTimeout(function() {
                try {
                    saveCurrentState();
                    var config = getInputs();
                    var results = runCoreSimulation(config);
                    SIM_LIST[ACTIVE_SIM_INDEX].results = results;
                    SIM_DATA = results; 

                    setText("viewAvg", "Average (" + results.avg.dps.toFixed(1) + ")");
                    setText("viewMin", "Min (" + results.min.dps.toFixed(1) + ")");
                    setText("viewMax", "Max (" + results.max.dps.toFixed(1) + ")");

                    switchView('avg');
                    var btnW = document.getElementById("btnWeights");
                    if(btnW) btnW.disabled = false;
                    updateProgress(100);
                } catch (e) { alert("Error: " + e.message); console.error(e); } 
                finally { setTimeout(hideProgress, 200); }
            }, 100);
        } catch(e) { setTimeout(hideProgress, 200); }
    }, 100);
}

function runAllSims() {
    showProgress("Running All...");
    var idx = 0;
    function step() {
        if(idx >= SIM_LIST.length) {
            updateProgress(100);
            setTimeout(hideProgress, 500);
            showOverview(); 
            return;
        }
        var pct = (idx / SIM_LIST.length) * 100;
        updateProgress(pct);
        
        ACTIVE_SIM_INDEX = idx;
        applyConfigToUI(SIM_LIST[idx].config);
        
        setTimeout(function() {
            var config = getInputs();
            var res = runCoreSimulation(config);
            SIM_LIST[idx].results = res;
            idx++;
            step();
        }, 100);
    }
    step();
}

function calculateWeights() {
    showProgress("Calculating Weights...");
    setTimeout(function() {
        try {
            var b = getInputs(); 
            //b.mode = "D_AVG"; b.iterations = 1; b.maxTime = 120;
            b.mode = "S"; b.iterations = 5000; b.maxTime = 120;

            var rB = runCoreSimulation(b).avg.dps;

            var dSP = 50;
            var cSP = JSON.parse(JSON.stringify(b)); cSP.power.sp += dSP;
            var rSP = runCoreSimulation(cSP).avg.dps;
            var wSP = (rSP - rB) / dSP;
            
            if(wSP === 0) wSP = 1;

            var cCrit = JSON.parse(JSON.stringify(b)); cCrit.stats.crit += 1;
            var wCrit = (runCoreSimulation(cCrit).avg.dps - rB) / wSP;
            if(wCrit < 0) wCrit = 0;

            var cHit = JSON.parse(JSON.stringify(b)); 
            cHit.stats.hitBonus += 1; 
            cHit.stats.hit = Math.min(0.99, 0.83 + cHit.stats.hitBonus/100); 
            var wHit = (runCoreSimulation(cHit).avg.dps - rB) / wSP;
            if(wHit < 0) wHit = 0;

            var cHaste = JSON.parse(JSON.stringify(b)); cHaste.stats.haste += 1;
            var wHaste = (runCoreSimulation(cHaste).avg.dps - rB) / wSP;
            if(wHaste < 0) wHaste = 0;

            var resBox = document.getElementById("weightResults");
            if(resBox) resBox.classList.remove("hidden");
            
            setText("val_crit", wCrit.toFixed(2));
            setText("val_hit", wHit.toFixed(2));
            setText("val_haste", wHaste.toFixed(2));
        } catch(e) { console.error(e); }
        hideProgress();
    }, 50);
}

// ============================================================================
// MATH CORE
// ============================================================================

function runCoreSimulation(cfg) {
    var effResNat = Math.max(0, (cfg.enemy.level - 60)*5 + cfg.enemy.resNat - cfg.power.pen);
    var effResArc = Math.max(0, (cfg.enemy.level - 60)*5 + cfg.enemy.resArc - cfg.power.pen);
    var avgMitNat = Math.min(0.75, (effResNat / (cfg.enemy.level * 5)) * 0.75);
    var avgMitArc = Math.min(0.75, (effResArc / (cfg.enemy.level * 5)) * 0.75);
    var eclipseMod = 10 + 60 * (cfg.stats.crit / 100); 
    var eclFactor = eclipseMod / 100;
    var cosMod = 1 + 0.1 * cfg.enemy.cos; 

    var w_base = 310; var w_coeff = (2.0 / 3.5) * 1.05;
    var sf_base = 540; var sf_coeff = 1.0;
    var mf_d_base = 210; var mf_d_coeff = 0.14; 
    var mf_t_base = 95.6; var mf_t_coeff = 0.13; 
    var is_base = 53.35; var is_coeff = ((18/15)*0.95*1.25)/9;
    var durMF = 18.0 + (cfg.gear.t3_4p ? 3.0 : 0); var standardTicksMF = 6;
    var durIS = 18.0 + (cfg.gear.t3_4p ? 2.0 : 0); var standardTicksIS = 9;

    var Spells = {
        Wrath: { name: "Wrath", id: "Wrath", type: "Nature", baseCast: 1.5, base: w_base, coeff: w_coeff, flight: cfg.rota.wrathFlight, isDot: false, cost: 149 },
        Starfire: { name: "Starfire", id: "Starfire", type: "Arcane", baseCast: 3.0, base: sf_base, coeff: sf_coeff, flight: 0.0, isDot: false, cost: 241 },
        Moonfire: { name: "Moonfire", id: "Moonfire", type: "Arcane", baseCast: 0, base: mf_d_base, coeff: mf_d_coeff, tickBase: mf_t_base, tickCoeff: mf_t_coeff, dur: durMF, tick: 3.0, flight: 0.0, isDot: true, baseTicks: standardTicksMF, cost: 266 },
        InsectSwarm: { name: "Insect Swarm", id: "InsectSwarm", type: "Nature", baseCast: 0, base: 0, coeff: 0, tickBase: is_base, tickCoeff: is_coeff, dur: durIS, tick: 2.0, flight: 0.0, isDot: true, baseTicks: standardTicksIS, cost: 128 }
    };

    var GlobalStats = { totalDmg: 0, totalMana: 0, dmgIS: 0, dmgMFDirect: 0, dmgMFTick: 0, dmgWrath: 0, dmgStarfire: 0, dmgT36p: 0, dmgIdol: 0, dmgT34p: 0, dmgScythe: 0, casts: 0, misses: 0, hits: 0, dmgCrit: 0, uptimeAE: 0, uptimeNE: 0 };
    var minDmg = Infinity, maxDmg = -1;
    var minStats = null, maxStats = null;
    var minLog = [];
    var maxLog = [];

    for (var run = 0; run < cfg.iterations; run++) {
        var State = { t: 0.0, gcdEnd: 0.0, castEnd: 0.0, casting: false, spellId: null, neEnd: 0.0, aeEnd: 0.0, neCD: 0.0, aeCD: 0.0, ng: false, boat: cfg.rota.startBoat, t38End: 0.0, t3End: 0.0, fishingLastCast: "", activeMF: null, activeIS: null, pendingImpacts: [], dotCounter: 0, bindingEnd: 0.0, bindingCD: 0.0, reosEnd: 0.0, reosCD: 0.0, toepEnd: 0.0, toepCD: 0.0, roopEnd: 0.0, roopCD: 0.0, zhcEnd: 0.0, zhcCD: 0.0, zhcVal: 0, ooc: false, boon: 0,
                      sulfurasEnd: 0.0, wocEnd: 0.0, scytheImbued: false, scytheDebuffArcaneEnd: 0.0, scytheDebuffNatureEnd: 0.0, scytheUseEnd: 0.0, scytheUseCD: 0.0 };
        var RunStats = { totalDmg: 0, totalMana: 0, dmgIS: 0, dmgMFDirect: 0, dmgMFTick: 0, dmgWrath: 0, dmgStarfire: 0, dmgT36p: 0, dmgIdol: 0, dmgT34p: 0, dmgScythe: 0, casts: 0, misses: 0, hits: 0, dmgCrit: 0, uptimeAE: 0, uptimeNE: 0 };
        var RunLog = [];
        var RNG = { mode: cfg.mode, acc: { hit: 0, crit: 0, procNE: 0, procAE: 0, procBoaT: 0, procT36p: 0, binding: 0, scythe: 0, ooc: 0, boon: 0, sulfuras: 0, woc: 0 }, check: function (chance, id) { if(this.mode === "S") return Math.random()*100 < chance; this.acc[id] += chance; if(this.acc[id] >= 100){ this.acc[id] -= 100; return true; } return false; }, checkHit: function(chance) { if(this.mode === "S") return Math.random() < chance; if(this.mode === "D_AVG") return true; this.acc.hit += (1.0 - chance); if(this.acc.hit >= 1.0){ this.acc.hit -= 1.0; return false; } return true; } };
        var isNE = function() { return State.t < State.neEnd; };
        var isAE = function() { return State.t < State.aeEnd; };
        var getCurrentSP = function(school) { 
            var val = cfg.power.sp; 
            if (school === "Nature") val += cfg.power.nat; 
            if (school === "Arcane") val += cfg.power.arc; 
            if (State.t < State.bindingEnd) val += 100; 
            if (State.t < State.reosEnd) val += 130; 
            if (State.t < State.toepEnd) val += 175; 
            if (State.t < State.roopEnd) val += 55; // RoOP
            if (State.t < State.zhcEnd && State.zhcVal > 0) val += State.zhcVal; // ZHC
            if (State.t < State.wocEnd) val += 132; // Wrath of Cenarius
            return val; 
        };
        var getCurrentHaste = function() {
            var h = cfg.stats.haste;
            if (cfg.gear.t3_8p && State.t < State.t38End) h += 10;
            if (State.t < State.sulfurasEnd) h += 5;
            if (State.t < State.scytheUseEnd) h += 10;
            return h;
        };
        var log = function(time, evt, spell, res, dmg, castTime, info, mana) { 
            var eclStr = ""; if(isNE()) eclStr="NAT"; if(isAE()) eclStr="ARC"; 
            var mfRem = (State.activeMF && State.activeMF.exp > time) ? (State.activeMF.exp - time).toFixed(1) : "-"; 
            var isRem = (State.activeIS && State.activeIS.exp > time) ? (State.activeIS.exp - time).toFixed(1) : "-"; 
            var t3pStr = (State.t3End > time) ? (State.t3End - time).toFixed(1) : "-"; 
            var t38Str = (State.t38End > time) ? (State.t38End - time).toFixed(1) : "-"; 
            var ngStr = State.ng ? "YES" : "-"; 
            var bBind = (State.bindingEnd > time) ? (State.bindingEnd - time).toFixed(1) : "-"; 
            var bReos = (State.reosEnd > time) ? (State.reosEnd - time).toFixed(1) : "-"; 
            var bToep = (State.toepEnd > time) ? (State.toepEnd - time).toFixed(1) : "-"; 
            var bRoop = (State.roopEnd > time) ? (State.roopEnd - time).toFixed(1) : "-"; 
            var bZhc = (State.zhcEnd > time) ? (State.zhcVal) : "-"; 
            
            // NEW LOGGERS
            var bTbos = (State.sulfurasEnd > time) ? (State.sulfurasEnd - time).toFixed(1) : "-";
            var bWoc = (State.wocEnd > time) ? (State.wocEnd - time).toFixed(1) : "-";
            
            // SoE Logic
            var bSoe = "-";
            var remA = State.scytheDebuffArcaneEnd - time;
            var remN = State.scytheDebuffNatureEnd - time;
            if(remA > 0 && remN > 0) bSoe = "A:" + remA.toFixed(1) + "/N:" + remN.toFixed(1);
            else if(remA > 0) bSoe = "Arc " + remA.toFixed(1);
            else if(remN > 0) bSoe = "Nat " + remN.toFixed(1);

            var oocStr = State.ooc ? "YES" : "-"; var boonStr = State.boon > 0 ? State.boon : "-"; var dispSP = getCurrentSP("Arcane"); var dispHaste = getCurrentHaste().toFixed(1) + "%"; var manaStr = (mana !== undefined) ? mana : "-"; 
            RunLog.push({ t: time.toFixed(2), evt: evt, spell: spell, res: res, dmgNorm: dmg ? dmg.norm : 0, dmgEcl: dmg ? dmg.ecl : 0, dmgCrit: dmg ? dmg.crit : 0, castTime: castTime ? castTime + "s" : "-", ecl: eclStr, mfRem: mfRem, isRem: isRem, boat: State.boat, ng: ngStr, ooc: oocStr, boon: boonStr, sp: dispSP, haste: dispHaste, t36: t3pStr, t38: t38Str, bBind: bBind, bReos: bReos, bToep: bToep, bRoop: bRoop, bZhc: bZhc, bTbos: bTbos, bWoc: bWoc, bSoe: bSoe, mana: manaStr, info: info || "", isAE: isAE(), isNE: isNE() }); 
        };
        var addEvt = function(time, type, data) { if(isNaN(time)) time = State.t; State.pendingImpacts.push({t:time, type:type, data:data}); State.pendingImpacts.sort(function(a,b) { return a.t - b.t; }); };
        var cancelCurrentCast = function() { var idx = State.pendingImpacts.findIndex(function(e) { return e.type === "CAST_FINISH"; }); if (idx > -1) { State.pendingImpacts.splice(idx, 1); State.casting = false; State.currentSpellId = null; log(State.t, "INTERRUPT", "Cancel", "-", null, null, "Wrong Eclipse"); } };
        var getResist = function(school) { var avgMit = (school === "Nature") ? avgMitNat : avgMitArc; if (cfg.mode !== "S") { return { val: 1.0 - avgMit, txt: "" }; } var range = avgMit / 0.25; var bucket = Math.floor(range); var remainder = range - bucket; if (Math.random() < remainder) bucket++; if (bucket > 3) bucket = 3; var resistPct = bucket * 0.25; var dmgFactor = 1.0 - resistPct; var txt = (resistPct > 0) ? "Part " + (resistPct*100).toFixed(0) + "%" : ""; return { val: dmgFactor, txt: txt }; };
        var checkTrinkets = function() { 
            var use = false; 
            if(cfg.gear.trinket_strat === "START") use = true; 
            if(cfg.gear.trinket_strat === "ECLIPSE" && (isNE() || isAE())) use = true; 
            if(use) { 
                if(cfg.gear.reos && State.t >= State.reosCD) { State.reosEnd = State.t + 20.0; State.reosCD = State.t + 120.0; log(State.t, "USE", "Essence of Sapphiron", "", null, null, "+130 SP"); } 
                if(cfg.gear.toep && State.t >= State.toepCD) { State.toepEnd = State.t + 15.0; State.toepCD = State.t + 90.0; log(State.t, "USE", "Talisman (ToEP)", "", null, null, "+175 SP"); } 
                if(cfg.gear.roop && State.t >= State.roopCD) { State.roopEnd = State.t + 60.0; State.roopCD = State.t + 180.0; log(State.t, "USE", "Remains of Overwhelming Power", "", null, null, "+55 SP"); } 
                if(cfg.gear.zhc && State.t >= State.zhcCD) { State.zhcEnd = State.t + 20.0; State.zhcCD = State.t + 120.0; State.zhcVal = 204; log(State.t, "USE", "Zandalarian Hero Charm", "", null, null, "+204 SP"); } 
                if(cfg.gear.scythe_use && State.t >= State.scytheUseCD) { State.scytheUseEnd = State.t + 8.0; State.scytheUseCD = State.t + 600.0; log(State.t, "USE", "Scythe of Elune", "", null, null, "+10% Haste"); }
            } 
        };
        var getCastTime = function(spellId, baseCast) { var base = baseCast; if(State.ng && (spellId==="Wrath" || spellId==="Starfire")) base -= 0.5; if(spellId==="Starfire") { if(State.boat > 0) base -= cfg.talents.boatReduc; if(cfg.gear.idolEoF) base -= 0.2; } if(base < 0) base = 0; var haste = getCurrentHaste(); return Math.max(0, base / (1 + haste/100)); };
        var calculateDamageFull = function(spell, isTick, forceSnap, isCrit, resistData) { var useEcl = (forceSnap !== undefined) ? forceSnap : ((spell.type === "Nature" && isNE()) || (spell.type === "Arcane" && isAE())); var currentSP = getCurrentSP(spell.type); var baseRaw = (isTick) ? (spell.tickBase + spell.tickCoeff * currentSP) : (spell.base + spell.coeff * currentSP); var baseClassMod = 0.10; if (spell.id === "InsectSwarm") baseClassMod = 0.25; if (spell.id === "Moonfire" && !isTick) baseClassMod = 0.20; if (spell.id === "Moonfire" && isTick) baseClassMod = 0.35; var currentEclMod = useEcl ? eclFactor : 0; var idolMod = 0; if(spell.id === "Moonfire" && cfg.gear.idolMoon) idolMod = 0.17; if(spell.id === "InsectSwarm" && cfg.gear.idolProp) idolMod = 0.17; var t3Mod = 0; var hasT3 = false; if (cfg.gear.t3_6p && State.t < State.t3End) { t3Mod = 0.03; hasT3 = true; } var classMult = 1.0 + baseClassMod + currentEclMod + idolMod + t3Mod; var debuffMult = 1.0; if (spell.type === "Arcane") debuffMult = 1.0 * cosMod; if (spell.type === "Arcane" && State.t < State.scytheDebuffArcaneEnd) debuffMult *= 1.08; if (spell.type === "Nature" && State.t < State.scytheDebuffNatureEnd) debuffMult *= 1.08; if(cfg.mode === "D_AVG") { var hitM = cfg.stats.hit; var avgRes = (spell.type==="Nature" ? avgMitNat : avgMitArc); var critM = 1.0; if (!isTick) critM = (1.0 + (cfg.stats.crit/100)); debuffMult *= hitM * critM * (1.0 - avgRes); isCrit = false; } else { if (resistData) debuffMult *= resistData.val; } var finalDmg = baseRaw * classMult * debuffMult; var critBonus = isCrit ? finalDmg : 0; var total = finalDmg + critBonus; var classMultNoEcl = 1.0 + baseClassMod + idolMod + t3Mod; var ratio = classMultNoEcl / classMult; var logNorm = total * ratio; var logCrit = 0; if(cfg.mode === "D_AVG" && !isTick) { var critM = (1.0 + (cfg.stats.crit/100)); var nonCritTotal = total / critM; logCrit = total - nonCritTotal; var ratioEcl = (classMultNoEcl / classMult); var normBase = nonCritTotal * ratioEcl; var eclBase = nonCritTotal - normBase; logNorm = normBase; var logEcl = eclBase; } else { if (isCrit) { logCrit = total / 2; var basePart = logCrit; logNorm = basePart * ratio; var logEcl = basePart - logNorm; } else { logCrit = 0; logNorm = total * ratio; var logEcl = total - logNorm; } } var t3Part = 0; if (hasT3) { var modWithout = classMult - 0.03; var ratioT3 = modWithout / classMult; t3Part = total - (total * ratioT3); } return { total: total, norm: logNorm, ecl: total-logNorm-logCrit, crit: logCrit, t3Part: t3Part, idolPart: 0 }; };
        var performCast = function(spell) { checkTrinkets(); var ct = getCastTime(spell.id, spell.baseCast); State.casting = true; State.castEnd = State.t + ct + cfg.avcd; State.gcdEnd = State.t + 1.5 + cfg.avcd; if(spell.id === "Wrath") State.gcdEnd = State.t + 1.5 + cfg.avcd; var cost = spell.cost; var note = ""; if (State.ooc) { cost = 0; State.ooc = false; note = "OoC"; } else if (spell.id === "Wrath" && State.boon > 0) { cost = cost / 2; State.boon--; note = "Boon"; } RunStats.totalMana += cost; State.currentSpellId = spell.id; RunStats.casts++; log(State.t, "CAST_START", spell.name, "-", null, ct.toFixed(2), note, cost); if(State.ng && (spell.id==="Wrath" || spell.id==="Starfire")) State.ng = false; if(spell.id==="Starfire" && State.boat > 0) State.boat--; if(spell.id==="Wrath" || spell.id==="Starfire") State.fishingLastCast = spell.id; addEvt(State.t + ct, "CAST_FINISH", { spell: spell }); };
        var handleCastFinish = function(spell) { 
            State.casting = false; State.currentSpellId = null; 
            
            // ZHC Logic: Decrease stack AFTER cast finishes
            if (State.t < State.zhcEnd && State.zhcVal > 0) {
                 State.zhcVal -= 17;
                 if (State.zhcVal < 0) State.zhcVal = 0;
            }

            if (!RNG.checkHit(cfg.stats.hit)) { RunStats.misses++; log(State.t, "MISS", spell.name, "Miss", null, null, "-"); return; } 
            RunStats.hits++; var isCrit = RNG.check(cfg.stats.crit, "crit"); var eclActive = ( (spell.type==="Nature" && isNE()) || (spell.type==="Arcane" && isAE()) ); if (spell.isDot) { State.dotCounter++; var dot = { id: State.dotCounter, spell: spell, next: State.t + spell.tick, exp: State.t + spell.dur, snap: eclActive, tickCount: 0 }; if (spell.id === "Moonfire") State.activeMF = dot; else State.activeIS = dot; addEvt(dot.next, "DOT_TICK", { spellId: spell.id, dotId: dot.id }); if (spell.base > 0) handleImpact(spell, isCrit, eclActive); } else { addEvt(State.t + spell.flight, "IMPACT", { spell: spell, crit: isCrit, snap: eclActive }); } 
        };
        var handleImpact = function(spell, crit, snap) { 
            // CONSUME SCYTHE IMBUE
            if (State.scytheImbued) {
                State.scytheImbued = false;
                if (spell.type === "Arcane") {
                    var baseDouble = 500 + Math.random() * 150;
                    if(cfg.mode !== "S") baseDouble = 575;
                    var doubleDmg = baseDouble * cosMod;
                    if (crit) doubleDmg *= 2; // Can crit, assume linked to spell crit check? "can crit" usually implies separate roll or inherits. Simplified: Inherits crit status from trigger or separate? Prompt says "can crit". We'll do a separate roll.
                    if (RNG.check(cfg.stats.crit, "scythe")) doubleDmg *= 1.5; // Scythe Crit Mod usually standard spell crit mod? Using 1.5 default
                    RunStats.totalDmg += doubleDmg;
                    RunStats.dmgScythe += doubleDmg;
                    log(State.t, "PROC DMG", "Scythe (Double)", "Hit", {norm:doubleDmg, ecl:0, crit:0, total:doubleDmg}, null, "Double Proc");
                    State.scytheDebuffArcaneEnd = State.t + 10.0;
                }
                if (spell.type === "Nature") {
                    State.scytheDebuffNatureEnd = State.t + 10.0;
                }
            }

            var resData; if(cfg.mode === "D_AVG") resData = {val:1.0, txt:""}; else resData = getResist(spell.type); var d = calculateDamageFull(spell, false, snap, crit, resData); RunStats.totalDmg += d.total; RunStats.dmgT36p += d.t3Part; if (d.crit > 0) RunStats.dmgCrit += d.crit; if (spell.id === "Wrath") RunStats.dmgWrath += d.total; if (spell.id === "Starfire") RunStats.dmgStarfire += d.total; if (spell.id === "Moonfire") RunStats.dmgMFDirect += d.total; if (cfg.talents.ooc && RNG.check(5, "ooc")) { State.ooc = true; log(State.t, "PROC", "Omen of Clarity", "", null, null, "Clearcast"); } if (spell.id === "Moonfire" && cfg.talents.boon && RNG.check(30, "boon")) { if (State.boon < 3) State.boon++; } if (spell.id === "Moonfire" && cfg.gear.idolMoonfang) { RunStats.totalMana -= 50; log(State.t, "PROC", "Moonfang", "", null, null, "Restore 50", "-50"); } if(cfg.gear.binding && State.t >= State.bindingCD && RNG.check(5, "binding")) { State.bindingEnd = State.t + 5.0; State.bindingCD = State.t + 15.0; log(State.t, "PROC", "Binding", "", null, null, "+100 SP"); } 
            
            // SCYTHE PROC (Passive)
            if(cfg.gear.scythe && RNG.check(5, "scythe")) { var baseScythe = 500 + Math.random() * 150; if(cfg.mode !== "S") baseScythe = 575; var scytheDmg = baseScythe * cosMod; if(RNG.check(cfg.stats.crit, "scythe")) scytheDmg *= 1.5; RunStats.totalDmg += scytheDmg; RunStats.dmgScythe += scytheDmg; log(State.t, "PROC DMG", "Scythe of Elune", "Hit", {norm:scytheDmg, ecl:0, crit:0, total:scytheDmg}, null, "Arcane Dmg"); State.scytheImbued = true; } 
            
            // Sulfuras Proc
            if(cfg.gear.sulfuras && RNG.check(8, "sulfuras")) { State.sulfurasEnd = State.t + 6.0; log(State.t, "PROC", "Sulfuras", "", null, null, "+5% Haste"); }

            // WoC Proc
            if(cfg.gear.woc && RNG.check(5, "woc")) { State.wocEnd = State.t + 10.0; log(State.t, "PROC", "Wrath of Cenarius", "", null, null, "+132 SP"); }

            if (crit) { State.ng = true; log(State.t, "PROC", "Nature's Grace", "", null, null, "Crit -> NG"); } var triggeredEclipse = false; var canProc = true; if (cfg.talents.onCrit && !crit) canProc = false; if (canProc) { if (spell.id === "Starfire" && !isAE() && State.t >= State.neCD && RNG.check(cfg.talents.nEProc, "procNE")) { State.neEnd = State.t + cfg.talents.neDuration; State.neCD = State.t + cfg.talents.neICD; triggeredEclipse = true; log(State.t, "PROC", "Nature Eclipse", "Proc", null, null, "SF -> NE"); if (cfg.rota.spellInterrupt && State.casting && (State.currentSpellId==="Starfire" || State.currentSpellId==="Moonfire")) cancelCurrentCast(); } if (spell.id === "Wrath" && !isNE() && State.t >= State.aeCD && RNG.check(cfg.talents.aEProc, "procAE")) { State.aeEnd = State.t + cfg.talents.aeDuration; State.aeCD = State.t + cfg.talents.aeICD; triggeredEclipse = true; log(State.t, "PROC", "Arcane Eclipse", "Proc", null, null, "Wrath -> AE"); if (cfg.rota.spellInterrupt && State.casting && (State.currentSpellId==="Wrath" || State.currentSpellId==="InsectSwarm")) cancelCurrentCast(); } } if(triggeredEclipse) { if (cfg.gear.t3_8p) State.t38End = State.t + 8.0; checkTrinkets(); } var hitTxt = (cfg.mode === "D_AVG") ? "Hit" : (crit?"CRIT":"Hit"); log(State.t, "IMPACT", spell.name, hitTxt, d, null, resData.txt); };
        var handleTick = function(payload) { var dot = (payload.spellId === "Moonfire") ? State.activeMF : State.activeIS; if (!dot || payload.dotId !== dot.id || State.t > dot.exp + 0.01) return; dot.tickCount++; var d = calculateDamageFull(dot.spell, true, dot.snap, false, null); RunStats.totalDmg += d.total; RunStats.dmgT36p += d.t3Part; var isExtraTick = false; if (cfg.gear.t3_4p && ((payload.spellId === "Moonfire" && dot.tickCount > 6) || (payload.spellId === "InsectSwarm" && dot.tickCount > 9))) { isExtraTick = true; RunStats.dmgT34p += d.total; } if (payload.spellId === "InsectSwarm") RunStats.dmgIS += d.total; if (payload.spellId === "Moonfire") RunStats.dmgMFTick += d.total; if (payload.spellId === "Moonfire" && cfg.talents.boon && RNG.check(30, "boon") && State.boon < 3) State.boon++; if (payload.spellId === "InsectSwarm" && RNG.check(cfg.talents.boatChance * 100, "procBoaT") && State.boat < 3) State.boat++; if (cfg.gear.t3_6p && RNG.check(8, "procT36p")) { State.t3End = State.t + 6.0; log(State.t, "PROC", "Dreamwalker (6p)", "", null, null, "8% on Tick"); } log(State.t, "TICK", dot.spell.name, "Tick", d, null, (dot.snap?"Snap:ECL":"Norm")); if (State.t + dot.spell.tick <= dot.exp + 0.01) addEvt(State.t + dot.spell.tick, "DOT_TICK", { spellId: dot.spell.id, dotId: dot.id }); else { if (payload.spellId === "Moonfire") State.activeMF = null; else State.activeIS = null; } };
        
        // MODIFIED decideSpell FUNCTION
        var decideSpell = function() { 
            var aeUp = Math.max(0, State.aeEnd - State.t); 
            var neUp = Math.max(0, State.neEnd - State.t); 
            var isMF = State.activeMF && State.activeMF.exp > State.t; 
            var isIS = State.activeIS && State.activeIS.exp > State.t; 
            
            if (aeUp > 0) { 
                var sfCast = getCastTime(Spells.Starfire.id, Spells.Starfire.baseCast); 
                // CHECK IF SF IS ENABLED
                if (aeUp > sfCast && cfg.rota.castSF) return Spells.Starfire; 
                
                if (cfg.rota.castMF && cfg.rota.eclDOT && (!isMF || State.activeMF.exp - State.t < 2)) return Spells.Moonfire; 
                if (cfg.rota.castSF) return Spells.Starfire; 
                if (cfg.rota.castW) return Spells.Wrath; 
                return null; 
            } else if (neUp > 0) { 
                var wCast = getCastTime(Spells.Wrath.id, Spells.Wrath.baseCast); 
                // CHECK IF WRATH IS ENABLED
                if (neUp > wCast && cfg.rota.castW) return Spells.Wrath; 
                
                if (cfg.rota.castIS && cfg.rota.eclDOT && (!isIS || State.activeIS.exp - State.t < 2)) return Spells.InsectSwarm; 
                if (cfg.rota.castW) return Spells.Wrath; 
                if (cfg.rota.castSF) return Spells.Starfire; 
                return null; 
            } else { 
                if (cfg.rota.castIS && (!isIS || State.activeIS.exp < State.t + 1.5)) return Spells.InsectSwarm; 
                if (cfg.rota.castMF && (!isMF || State.activeMF.exp < State.t + 1.5)) return Spells.Moonfire; 
                var aeCD = Math.max(0, State.aeCD - State.t); 
                var neCD = Math.max(0, State.neCD - State.t); 
                if(aeCD > 0 && neCD === 0 && cfg.rota.castSF) return Spells.Starfire; 
                if(neCD > 0 && aeCD === 0 && cfg.rota.castW) return Spells.Wrath; 
                if(cfg.rota.fishMeth === "F1") { if((State.fishingLastCast==="" || State.fishingLastCast==="Wrath") && cfg.rota.castSF) return Spells.Starfire; if(cfg.rota.castW) return Spells.Wrath; } 
                if(cfg.rota.fishMeth === "F2") { if((State.fishingLastCast==="" || State.fishingLastCast==="Starfire") && cfg.rota.castW) return Spells.Wrath; if(cfg.rota.castSF) return Spells.Starfire; } 
                if(cfg.rota.fishMeth === "W" && cfg.rota.castW) return Spells.Wrath; 
                if(cfg.rota.fishMeth === "SF" && cfg.rota.castSF) return Spells.Starfire; 
                // Fallback to whatever is enabled
                if(cfg.rota.castSF) return Spells.Starfire; 
                if(cfg.rota.castW) return Spells.Wrath; 
                return null; 
            } 
        };

        var loopGuard = 0;
        while (State.t < cfg.maxTime && loopGuard < 50000) {
            loopGuard++;
            while (State.pendingImpacts.length > 0 && State.pendingImpacts[0].t <= State.t + 0.001) {
                var evt = State.pendingImpacts.shift();
                checkTrinkets();
                if (evt.type === "CAST_FINISH") handleCastFinish(evt.data.spell);
                else if (evt.type === "IMPACT") handleImpact(evt.data.spell, evt.data.crit, evt.data.snap);
                else if (evt.type === "DOT_TICK") handleTick(evt.data);
            }
            var gcdReady = State.t >= (State.gcdEnd - 0.001) && State.t >= (State.castEnd - 0.001);
            if (!State.isCasting && gcdReady && State.t < cfg.maxTime) {
                var spell = decideSpell();
                if (spell) performCast(spell);
                else { State.t += 0.1; }
            } else {
                var nextEvt = (State.pendingImpacts.length > 0) ? State.pendingImpacts[0].t : 99999;
                var playerReady = (State.gcdEnd > State.castEnd) ? State.gcdEnd : State.castEnd;
                var nextAct = State.casting ? 99999 : (State.t < playerReady ? playerReady : State.t);
                var jump = Math.min(nextEvt, nextAct);
                if (jump > cfg.maxTime) jump = cfg.maxTime; if (jump >= 99990) break;
                var dt = jump - State.t;
                if (dt > 0) { if (isNE()) RunStats.uptimeNE += Math.min(dt, State.neEnd - State.t); if (isAE()) RunStats.uptimeAE += Math.min(dt, State.aeEnd - State.t); }
                if (jump <= State.t + 0.0001) {
                    if (nextEvt <= State.t + 0.001) { jump = State.t; } else {
                        var future = State.pendingImpacts.find(function(e) { return e.t > State.t + 0.001; });
                        var safeJump = Math.min(future ? future.t : 99999, (playerReady > State.t + 0.001) ? playerReady : 99999);
                        jump = (safeJump >= 99990) ? State.t + 0.1 : safeJump;
                    }
                }
                State.t = jump;
            }
        }
        for(var k in GlobalStats) GlobalStats[k] += RunStats[k];
        if(RunStats.totalDmg < minDmg) { minDmg = RunStats.totalDmg; minStats = JSON.parse(JSON.stringify(RunStats)); minLog = [...RunLog]; }
        if(RunStats.totalDmg > maxDmg) { maxDmg = RunStats.totalDmg; maxStats = JSON.parse(JSON.stringify(RunStats)); maxLog = [...RunLog]; }
    }

    var avgStats = JSON.parse(JSON.stringify(GlobalStats));
    for(var k in avgStats) avgStats[k] /= cfg.iterations;

    var avgLog = [];
    if(cfg.iterations === 1 && minLog.length > 0) { avgLog = minLog; }

    return { avg: { stats: avgStats, dps: avgStats.totalDmg / cfg.maxTime, log: avgLog }, min: { stats: minStats, dps: minStats.totalDmg / cfg.maxTime, log: minLog }, max: { stats: maxStats, dps: maxStats.totalDmg / cfg.maxTime, log: maxLog } };
}