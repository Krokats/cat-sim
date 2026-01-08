/**
 * Turtle WoW Feral Sim - File 5: Simulation Engine
 * Core Logic for Energy/GCD/Swing based combat
 */

// ============================================================================
// SIMULATION RUNNER
// ============================================================================

function runSimulation(simIndex) {
    // 1. Init State
    resetState();
    var Log = [];
    var totalDmg = 0;
    
    // Stats Snapshot (Base stats from Gear)
    var stats = getCharacterStats(); 
    State.currentAP = stats.ap;
    State.currentCrit = stats.crit;
    State.currentHit = stats.hit;
    State.currentHaste = stats.haste;
    
    // Setup Timers
    State.energyTick = 0.1; // First tick happens almost immediately (server sync simulation)
    State.swingTimer = 0.1; // Start attacking immediately
    State.gcdEnd = 0;

    // Simulation Loop
    while (State.t < State.duration) {
        
        // --- A. Determine Next Event Time ---
        // We look for the earliest event: GCD Ready, Energy Tick, or Swing Timer
        var nextT = State.duration;
        
        // 1. GCD Ready?
        if (State.gcdEnd > State.t) {
            nextT = Math.min(nextT, State.gcdEnd);
        } else {
            nextT = Math.min(nextT, State.t); // Ready now!
        }
        
        // 2. Swing Timer (White Hit)
        if (State.swingTimer > State.t) {
            nextT = Math.min(nextT, State.swingTimer);
        } else {
            nextT = Math.min(nextT, State.t); // Ready now!
        }
        
        // 3. Energy Tick
        if (State.energyTick > State.t) {
            nextT = Math.min(nextT, State.energyTick);
        }

        // --- B. Advance Time ---
        if (nextT > State.t) {
            State.t = nextT;
        }

        // Check End Condition
        if (State.t >= State.duration) break;

        // --- C. Process Events ---

        // 1. Energy Regeneration
        if (State.t >= State.energyTick) {
            // Apply Tick
            if (State.energy < 100) {
                State.energy = Math.min(100, State.energy + 20);
            }
            State.energyTick += 2.0; // Next tick in 2s
            
            // Check Tiger's Fury duration end (simplified check)
            if (State.buff_tigersfury > 0 && State.t > State.buff_tigersfury) {
                State.buff_tigersfury = 0;
            }
        }

        // 2. White Damage (Auto Attack)
        if (State.t >= State.swingTimer) {
            var hit = calculateSwing(stats, "White", 0);
            Log.push(createLogEntry(State.t, "Auto Attack", hit));
            totalDmg += hit.damage;
            
            // Omen of Clarity Proc (PPM based, approx 2.0 PPM -> ~3.3% on hit?)
            // Turtle/Vanilla Omen is on Hit. Let's assume 10% for now or PPM logic.
            // Standard Vanilla Omen is PPM 2. 
            // Chance = 2 * Speed / 60. E.g. 1.0 speed = 3.3%.
            var procChance = (2.0 * stats.weaponSpeed) / 60.0; 
            if (Math.random() < procChance) {
                State.buff_clearcasting = 1; // Active
            }

            // Reset Swing Timer
            // Formula: WeaponSpeed / Haste
            var speed = stats.weaponSpeed / State.currentHaste; 
            State.swingTimer += speed;
        }

        // 3. Yellow Damage (Abilities) - Only if GCD is ready
        if (State.t >= State.gcdEnd) {
            var action = decideAction();
            
            if (action && action !== "WAIT") {
                // Execute
                var result = executeAction(action, stats);
                if (result) {
                    Log.push(createLogEntry(State.t, action, result));
                    totalDmg += result.damage;
                    
                    // Set GCD (1.0s for Cat)
                    State.gcdEnd = State.t + 1.0; 
                }
            } else {
                // Nothing to do (Not enough energy), wait for next event (Tick or Swing)
                // If decided to "WAIT", we just loop again and time advances to next Tick.
            }
        }
    }
    
    return {
        dps: totalDmg / State.duration,
        totalDmg: totalDmg,
        duration: State.duration,
        log: Log
    };
}

// ============================================================================
// DECISION ENGINE (ROTATION)
// ============================================================================

function decideAction() {
    // Check Resources
    var currentEnergy = State.energy;
    var cp = State.combo;
    
    // --- 0. Cooldowns / Buffs ---
    
    // Tiger's Fury: Use if Energy is low (< 40) and not active
    // Turtle WoW: TF costs 30 energy, lasts 6s, +Dmg
    if (getVal("conf_use_tigersfury") && State.buff_tigersfury === 0 && currentEnergy < 40 && currentEnergy >= 30) {
        return "Tigers Fury";
    }

    // Faerie Fire: Keep active
    if (State.debuff_faeriefire <= State.t && State.cd_faeriefire <= State.t) {
        return "Faerie Fire";
    }

    // --- 1. Finishers (5 CP) ---
    // Or if Boss is about to die (simulated by time > duration - 2)
    if (cp >= 5 || (State.t > State.duration - 2 && cp >= 3)) {
        // Priority: Bite vs Rip
        var mode = getVal("finisher_mode") || "bite"; // "bite", "rip", "smart"
        
        if (mode === "rip") return "Rip";
        if (mode === "bite") return "Ferocious Bite";
        
        // Smart: Rip if it lasts full duration, else Bite
        if (State.debuff_rip <= State.t && (State.duration - State.t > 12)) {
            return "Rip";
        } else {
            return "Ferocious Bite";
        }
    }

    // --- 2. Maintenance (Rake) ---
    // Turtle WoW: Rake is needed for "Open Wounds" (+Claw Dmg)
    if (getVal("conf_use_rake")) {
        // Refresh if fell off
        if (State.debuff_rake <= State.t) {
            if (currentEnergy >= 40 || State.buff_clearcasting) return "Rake";
            // If not enough energy, we fall through to WAIT or RESHIFT
        }
    }

    // --- 3. Builders ---
    // Shred vs Claw
    var shredCost = 60 - (getVal("talent_imp_shred") ? 12 : 0); // Base 60, Talent -18? Check talents. Usually -12 or -18.
    // Turtle: Shred is 60. Imp Shred reduces cost.
    
    var clawCost = 45 - (getVal("talent_imp_claws") ? 5 : 0); // Base 45.
    
    // Decision: Usually Shred if Omen proc OR enough energy. 
    // If "Open Wounds" is active (Rake on target), Claw might be better/efficient?
    // For simplicity: User selection "use_shred".
    var useShred = getVal("use_shred");
    
    if (State.buff_clearcasting) {
        // Clearcasting: Use most expensive spell
        return useShred ? "Shred" : "Claw";
    }

    if (useShred && currentEnergy >= shredCost) return "Shred";
    if (!useShred && currentEnergy >= clawCost) return "Claw";

    // --- 4. Reshift / Wait ---
    // If we are here, we don't have enough energy for our desired builder.
    // Should we Reshift?
    
    // Check if we have Mana and Config allows it
    if (getVal("meta_reshift") && State.mana > 400 && currentEnergy < 10) {
        // Only shift if Energy is very low to maximize gain
        // Furor (Talent) gives 40. Wolfshead gives 20. Total 60.
        // If we have > 20 energy, shifting (reset to 60) gains < 40 energy for high mana cost.
        // Usually shift at < 10 energy.
        return "Reshift";
    }

    return "WAIT";
}

// ============================================================================
// ACTION EXECUTION
// ============================================================================

function executeAction(actionName, stats) {
    var dmg = 0;
    var cost = 0;
    var isCrit = false;
    var note = "";
    
    // Check Clearcasting
    var isOOC = (State.buff_clearcasting === 1);
    
    // --- Skills ---
    
    if (actionName === "Reshift") {
        // Turtle WoW: "Reshift" Spell or Powershift Macro
        // Cost: Mana
        State.mana -= 400; // Approx cost
        
        // Gain Energy: Furor (40) + Wolfshead (20)
        var energyGain = 0;
        if (getVal("talent_furor")) energyGain += 40;
        if (getVal("meta_wolfshead")) energyGain += 20;
        
        State.energy = energyGain;
        State.buff_tigersfury = 0; // Usually shifting removes Enrage/TF? Check Turtle. Assuming reset.
        
        return { damage: 0, text: "Energy Reset ("+energyGain+")" };
    }
    
    if (actionName === "Tigers Fury") {
        State.energy -= 30; // Cost
        State.buff_tigersfury = State.t + 6; // Lasts 6s
        return { damage: 0, text: "Buff Active" };
    }
    
    if (actionName === "Faerie Fire") {
        // No energy cost in Bear/Cat with talents? Usually free.
        State.debuff_faeriefire = State.t + 40;
        State.cd_faeriefire = State.t + 6;
        return { damage: 0, text: "Applied" };
    }
    
    // --- Damage Skills ---
    
    if (actionName === "Ferocious Bite") {
        cost = 35;
        if (isOOC) cost = 0;
        
        // Base Dmg calculation (approx Lvl 60 values)
        // FB scales with AP and extra energy
        var extraEnergy = Math.max(0, State.energy - cost);
        if (isOOC) extraEnergy = State.energy; // If OOC, all energy is "extra"
        
        // Formula: (Base + AP_Scale) + (ExtraEnergy * DmgPerEnergy)
        var ap = State.currentAP;
        var base = 200 + (ap * 0.15); // Placeholder formula
        base += extraEnergy * 2.0;    // Placeholder
        
        // Calc Crit/Hit
        var hitRes = calculateSwing(stats, "Yellow", 0);
        dmg = hitRes.damage + base; // Add Ability Base to Swing? No, FB is special.
        
        // FB replaces swing dmg with its own formula mostly, but uses Crit table.
        // Simplification:
        if (hitRes.type === "Crit") dmg *= 2;
        if (hitRes.type === "Miss" || hitRes.type === "Dodge") dmg = 0;
        else {
             State.combo = 0; // Reset CP only on hit
             State.energy -= (isOOC ? 0 : cost) + (isOOC ? 0 : extraEnergy);
        }
        
        note = cp + " CP";
    }
    
    else if (actionName === "Rip") {
        cost = 30;
        if (isOOC) cost = 0;
        State.energy -= cost;
        State.combo = 0;
        State.debuff_rip = State.t + 12;
        // Rip is a DoT, applies no instant damage usually.
        // We can simulate DoT damage here or add a "tick" event.
        // For simplicity in this engine version, we just log "Applied".
        // Real sim would need DoT tracking.
        return { damage: 0, text: "DoT Applied" };
    }
    
    else if (actionName === "Shred") {
        cost = 60; // Adjust for talent
        if (isOOC) cost = 0;
        
        // Damage: 225% Weapon Dmg + 180
        var weapDmg = calculateWeaponDamage(stats);
        var abilityDmg = (weapDmg * 2.25) + 180;
        
        // Calc Outcome
        var hitRes = calculateSwing(stats, "Yellow", 0);
        if (hitRes.type === "Miss" || hitRes.type === "Dodge") {
            dmg = 0;
            cost = cost * 0.2; // Energy refund on miss (80% returned)
        } else {
            dmg = abilityDmg;
            if (State.buff_tigersfury > State.t) dmg += 40; // TF Bonus
            if (hitRes.type === "Crit") dmg *= 2;
            
            State.combo += 1; // Generator
        }
        
        State.energy -= cost;
        if (isOOC) State.buff_clearcasting = 0; // Consume OOC
    }
    
    else if (actionName === "Rake") {
        cost = 40; // Adjust
        if (isOOC) cost = 0;
        
        // Damage: Initial + DoT
        var weapDmg = calculateWeaponDamage(stats); // Rake is usually low base dmg + dot
        var abilityDmg = (weapDmg * 0.5) + 20; // Placeholder
        
        var hitRes = calculateSwing(stats, "Yellow", 0);
        if (hitRes.type === "Miss" || hitRes.type === "Dodge") {
            dmg = 0;
            cost = cost * 0.2;
        } else {
            dmg = abilityDmg;
            if (hitRes.type === "Crit") dmg *= 2;
            State.combo += 1;
            State.debuff_rake = State.t + 9;
        }
        
        State.energy -= cost;
        if (isOOC) State.buff_clearcasting = 0;
    }

    else if (actionName === "Claw") {
        cost = 45;
        if (isOOC) cost = 0;
        
        var weapDmg = calculateWeaponDamage(stats);
        var abilityDmg = weapDmg + 115;
        
        // Open Wounds Check (Turtle WoW)
        if (getVal("talent_open_wounds") && State.debuff_rake > State.t) {
            abilityDmg *= 1.30; // +30% Damage if bleeding (Example Value)
            note = "OpenWounds";
        }

        var hitRes = calculateSwing(stats, "Yellow", 0);
        if (hitRes.type === "Miss" || hitRes.type === "Dodge") {
            dmg = 0;
            cost = cost * 0.2;
        } else {
            dmg = abilityDmg;
            if (State.buff_tigersfury > State.t) dmg += 40;
            if (hitRes.type === "Crit") dmg *= 2;
            State.combo += 1;
        }
        
        State.energy -= cost;
        if (isOOC) State.buff_clearcasting = 0;
    }

    // Return Result
    return {
        damage: Math.floor(dmg),
        type: hitRes ? hitRes.type : "Hit",
        text: note,
        energy: State.energy,
        combo: State.combo
    };
}

// ============================================================================
// MATH HELPERS
// ============================================================================

function getCharacterStats() {
    // Reads values from UI (gear.js must update these inputs first)
    return {
        ap: getVal("stat_ap"),
        crit: getVal("stat_crit"), // in %
        hit: getVal("stat_hit"),   // in %
        haste: 1.0 + (getVal("stat_haste") / 100),
        weaponSpeed: 1.0 // Cat is always 1.0 base speed
    };
}

function calculateWeaponDamage(stats) {
    // Feral AP scaling: DPS = (AP / 14) + 54.8 (Lvl 60 Cat base DPS approx)
    // Damage per hit (1.0 speed) = DPS * 1.0
    // Note: On Turtle, Weapons might add "Feral AP".
    var baseFeralDPS = 55; // Approx for Lvl 60
    var apDPS = stats.ap / 14;
    var damage = (baseFeralDPS + apDPS) * 1.0; 
    return damage;
}

function calculateSwing(stats, type, bonusCrit) {
    // Classic Attack Table
    // Miss -> Dodge -> Glancing (White only) -> Crit -> Hit
    
    var roll = Math.random() * 100;
    var missChance = Math.max(0, 5.0 - stats.hit); // 5% base miss vs lvl 60
    var dodgeChance = 5.0; // Base dodge
    var critChance = stats.crit + (bonusCrit || 0);
    var glanceChance = (type === "White") ? 40.0 : 0; // 40% Glancing on white
    
    var currentSum = 0;
    
    // 1. Miss
    currentSum += missChance;
    if (roll < currentSum) return { type: "Miss", damage: 0 };
    
    // 2. Dodge
    currentSum += dodgeChance;
    if (roll < currentSum) return { type: "Dodge", damage: 0 };
    
    // 3. Glancing (White Only)
    if (type === "White") {
        currentSum += glanceChance;
        if (roll < currentSum) {
            var dmg = calculateWeaponDamage(stats) * 0.7; // 30% penalty
            return { type: "Glance", damage: dmg };
        }
    }
    
    // 4. Crit
    // Crit cap check in vanilla is complex, simplified here
    currentSum += critChance;
    if (roll < currentSum) {
        var dmg = calculateWeaponDamage(stats); // Multiplied later
        return { type: "Crit", damage: dmg }; // Caller applies 2x
    }
    
    // 5. Normal Hit
    return { type: "Hit", damage: calculateWeaponDamage(stats) };
}

function createLogEntry(time, spell, result) {
    return {
        t: time.toFixed(2),
        spell: spell,
        damage: result.damage,
        type: result.type,
        info: result.text,
        energy: Math.floor(State.energy),
        combo: State.combo
    };
}

function resetState() {
    State.t = 0;
    State.energy = 100; // Start full? Or 0? Usually 100 out of combat.
    State.combo = 0;
    State.mana = 2000;
    State.buff_tigersfury = 0;
    State.debuff_rake = 0;
    State.debuff_rip = 0;
}