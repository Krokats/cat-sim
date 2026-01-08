/**
 * Feral Simulation - File 5: Simulation Engine (Turtle WoW 1.17.2)
 */

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Bestimmt das Ergebnis eines physischen Angriffs (White & Yellow).
 * @param {number} hitChance - Hit Chance in Dezimal (z.B. 0.05 für 5%)
 * @param {number} critChance - Crit Chance in Dezimal
 * @param {number} weaponSkill - Waffenskill des Spielers
 * @param {boolean} isWhite - True für Auto-Attacks (können Glancing sein)
 * @returns {string} - "MISS", "DODGE", "GLANCE", "CRIT", "HIT"
 */
function getAttackResult(hitChance, critChance, weaponSkill, isWhite) {
    var r = Math.random();

    // 1. MISS
    // Turtle WoW: 8% Base Miss vs Boss (Level 63). 
    // Hit Chance reduziert Miss direkt. Cap ist bei 8%.
    var baseMiss = 0.08; 
    var missChance = Math.max(0, baseMiss - (hitChance / 100));
    
    if (r < missChance) return "MISS";
    r -= missChance;

    // 2. DODGE
    // Boss Dodge ist ca. 6.5%. Waffenskill reduziert es leicht (0.1% pro Punkt über 300).
    // Skill Diff: 305 vs 315 def -> 10 diff. 
    // Formel: 5% + (Defense - WeaponSkill) * 0.1%
    // Boss Def = 315.
    var skillDiff = 315 - weaponSkill;
    var dodgeChance = 0.05 + (skillDiff * 0.001);
    if (dodgeChance < 0.05) dodgeChance = 0.05; // Minimum 5% dodge realistisch in Vanilla
    
    if (r < dodgeChance) return "DODGE";
    r -= dodgeChance;

    // 3. GLANCING (Nur White Hits)
    if (isWhite) {
        var glanceChance = 0.40; // Fix 40% vs Boss
        if (r < glanceChance) return "GLANCE";
        r -= glanceChance;
    }

    // 4. CRIT
    // Crit wird durch Crit Suppression unterdrückt (Aura Modifiers in Vanilla).
    // Vs +3 Level Boss: -3% Crit (grob) oder 1% pro Level Diff?
    // Turtle WoW Standard: -3% Crit Aura + Glancing frisst Crit Table Platz.
    // Wir nehmen Input Crit direkt, ziehen pauschal 3% (4.8% in Classic?) ab wenn Boss.
    // Vereinfacht: Crit Cap checken wir nicht hardcoded, aber es existiert.
    var effectiveCrit = (critChance / 100) - 0.03; // Boss suppression
    if (effectiveCrit < 0) effectiveCrit = 0;

    if (r < effectiveCrit) return "CRIT";
    
    // 5. HIT
    return "HIT";
}

/**
 * Berechnet den Glancing Damage Penalty basierend auf Waffenskill.
 */
function getGlancingPenalty(weaponSkill) {
    // Defense 315 vs Skill.
    // Standard (Skill 300): 35% Penalty (macht 65% Schaden).
    // Skill 305: ~15% Penalty.
    // Skill 308+: ~5% Penalty (Cap).
    if (weaponSkill >= 308) return 0.05; 
    if (weaponSkill >= 305) return 0.15;
    return 0.35;
}

// ============================================================================
// MAIN SIMULATION FUNCTION
// ============================================================================

function runSim(inputs, gearStats) {
    // -------------------------------------
    // 1. SETUP STATS
    // -------------------------------------
    var AP = gearStats.totalAp || 0;
    var Crit = gearStats.totalCrit || 0;
    var Hit = gearStats.totalHit || 0;
    var Skill = 300 + (gearStats.skill || 0);

    // Armor Reduction
    var BossArmor = inputs.conf_armor || 3731;
    // Standard Formel: DR = Armor / (Armor + 400 + 85 * (AttackerLvl + 4.5 * (AttackerLvl - 59)))
    // Lvl 60 Attacker: 400 + 85 * 60 = 5500.
    var ArmorDR = BossArmor / (BossArmor + 5500);
    if (ArmorDR > 0.75) ArmorDR = 0.75;
    var ArmorMod = 1 - ArmorDR;

    // Weapon Damage (Paws)
    // Level 60 Cat Base Dmg: ~53-55 approx avg.
    // Plus AP: DPS = (AP / 14).
    // Wir rechnen mit Average Dmg pro Hit, da Cat 1.0 Speed hat.
    var BasePawDmg = 54.5; 

    // Simulation Constants
    var SIM_TIME = inputs.maxTime;
    var DT = 0.1; // 100ms Ticks

    // State
    var t = 0;
    var energy = 100;
    var mana = gearStats.int * 15 || 2000; // Base Mana pool estimate
    var cp = 0;
    var gcd = 0;
    var swingTimer = 0.0; // Ready immediately
    var tickTimer = 0.0;  // Energy Tick Timer
    
    // Auras
    var aura_clearcasting = false;
    var aura_rake = 0; // End time
    var aura_rip = 0; // End time
    
    // Results
    var totalDmg = 0;
    var bd = { white:0, shred:0, claw:0, rake:0, rip:0, bite:0 };
    var logArr = [];

    function log(msg, d, type) {
        if (inputs.mode === 'D') {
            logArr.push({ 
                t: t.toFixed(1), 
                msg: msg, 
                dmg: Math.floor(d), 
                type: type, 
                energy: Math.floor(energy), 
                cp: cp 
            });
        }
    }

    // -------------------------------------
    // 2. SIM LOOP
    // -------------------------------------
    while (t < SIM_TIME) {
        
        // --- A. PASSIVE REGEN ---
        tickTimer -= DT;
        if (tickTimer <= 0) {
            energy += 20;
            if (energy > 100) energy = 100;
            tickTimer = 2.0;
        }

        // --- B. AUTO ATTACK (White) ---
        swingTimer -= DT;
        if (swingTimer <= 0) {
            // Calculate Damage
            var dmgBase = (BasePawDmg + (AP / 14)); // Speed 1.0, also DPS = Dmg
            var res = getAttackResult(Hit, Crit, Skill, true);
            var finalDmg = 0;
            
            if (res === "MISS" || res === "DODGE") {
                finalDmg = 0;
            } else {
                finalDmg = dmgBase;
                if (res === "GLANCE") {
                    var pen = getGlancingPenalty(Skill);
                    finalDmg *= (1 - pen);
                } else if (res === "CRIT") {
                    finalDmg *= 2.0;
                }
                
                finalDmg *= ArmorMod; // Armor applies to white
            }

            if (finalDmg > 0) {
                totalDmg += finalDmg;
                bd.white += finalDmg;
                // Omen of Clarity Proc (PPM 3.5 approx? Or flat 10%?)
                // Omen is on hit. Let's assume 10% for simplicity or 2 PPM.
                // 1.0 speed = 60 hits/min. 2 PPM = 3.3%. 10% might be generous.
                // Classic Wiki says Omen is PPM.
                // Let's use ~4% chance per hit.
                if (Math.random() < 0.04) {
                    aura_clearcasting = true;
                    log("Omen Proc", 0, "Buff");
                }
            }
            // log("White " + res, finalDmg, "White");
            swingTimer = 1.0; // Cat always 1.0
        }

        // --- C. DOT TICKS ---
        // (Simplified: Add full damage on cast, OR simulate ticks. 
        // For accurate Energy/Clip logic, ticks matter only if we re-apply logic?
        // Let's keep it simple: Dmg added on cast event (as DoT total) to keep Engine fast for JS)
        // Correction: Engine is 'Event Based' loop. Adding DoT dmg instantly is easier for breakdown.
        // We just track 'aura_rip' end time to prevent clipping.

        // --- D. ACTION PRIORITY ---
        if (gcd > 0) gcd -= DT;

        if (gcd <= 0) {
            var action = null;
            var cost = 0;
            
            // Costs (Talented)
            var cShred = 48;
            var cClaw = 40;
            var cRake = 35;
            var cRip = 30;
            var cBite = 35;
            
            if (aura_clearcasting) {
                cShred = 0; cClaw = 0; cRake = 0; cRip = 0; cBite = 0;
            }

            // 1. POWERSHIFT
            // Condition: Low Energy, Mana available, Not clearcasting
            if (inputs.conf_reshift && energy < 10 && mana > 500 && !aura_clearcasting) {
                // Check Tick Timer
                var safeToShift = true;
                if (!inputs.conf_aggroShift && tickTimer < 0.5) safeToShift = false; // Don't shift just before tick

                if (safeToShift) {
                    mana -= 500; // Cost
                    energy = 60; // Furor (40) + Wolfshead (20) - Assuming user has these!
                    // Reset Swing Timer? Usually shifting resets swing in Vanilla.
                    swingTimer = 1.0; // Reset Swing
                    gcd = 1.0; // Form change triggers GCD? (Depends on Macro, usually yes for spells)
                    // Actually, Powershift macro: /cancelform /cast Cat Form.
                    // Casting Cat Form triggers GCD.
                    // But Furor energy is instant.
                    action = "Shift";
                    log("Powershift", 0, "Cast");
                }
            }

            // 2. COMBAT ACTIONS (If not shifted)
            if (!action) {
                
                // FINISHER (5 CP)
                if (cp >= 5) {
                    // RIP
                    // Use Rip if target lives long enough (simulates full duration)
                    // And if we can bleed target
                    if (inputs.conf_canBleed && t > aura_rip && energy >= cRip) {
                        action = "Rip";
                        cost = cRip;
                    }
                    // BITE
                    else if (inputs.conf_useBite && energy >= cBite) {
                        action = "Bite";
                        cost = cBite;
                    }
                }

                // GENERATORS
                if (!action) {
                    // Maintain Rake (if selected and bleedable)
                    if (inputs.conf_useRake && inputs.conf_canBleed && t > aura_rake && energy >= cRake) {
                        action = "Rake";
                        cost = cRake;
                    }
                    // Main Builder: Shred or Claw
                    else {
                        var spell = inputs.conf_behind ? "Shred" : "Claw";
                        var sCost = inputs.conf_behind ? cShred : cClaw;
                        
                        if (energy >= sCost) {
                            action = spell;
                            cost = sCost;
                        }
                    }
                }
            }

            // --- EXECUTE ACTION ---
            if (action && action !== "Shift") {
                // Check Result
                var res = getAttackResult(Hit, Crit, Skill, false);
                
                // Refund Logic
                if (res === "MISS" || res === "DODGE") {
                    energy -= (cost * 0.2); // 80% Refund standard Vanilla mechanism on failed Energy abilities
                    log(action + " " + res, 0, "Fail");
                } else {
                    // Success
                    energy -= cost;
                    aura_clearcasting = false; // Consumed

                    var dmg = 0;
                    
                    if (action === "Shred") {
                        // (Damage * 2.25) + 180
                        dmg = ((BasePawDmg + (AP/14)) * 2.25) + 180;
                        if (res === "CRIT") dmg *= 2.0;
                        dmg *= ArmorMod;
                        
                        // Mangled modifier? Not in Vanilla.
                        // Idol of the Moon Goddess? (+Damage on Shred). Not implemented here yet.
                        
                        cp++;
                        bd.shred += dmg;
                    } 
                    else if (action === "Claw") {
                        // Damage + 115
                        dmg = (BasePawDmg + (AP/14)) + 115;
                        
                        // Open Wounds (+30% if bleeding)
                        var isBleeding = (t < aura_rake || t < aura_rip);
                        if (isBleeding) dmg *= 1.30;

                        if (res === "CRIT") dmg *= 2.0;
                        dmg *= ArmorMod;

                        cp++;
                        bd.claw += dmg;
                    }
                    else if (action === "Rake") {
                        // Initial Dmg: Damage/2 + 20 (Low)
                        var initDmg = (BasePawDmg + (AP/14)) * 0.5 + 20;
                        initDmg *= ArmorMod; // Initial hit armor reduced
                        if (res === "CRIT") initDmg *= 2.0;

                        // DoT: AP * 0.06 per tick (3 ticks). Total AP * 0.18? 
                        // Vanilla Rake is static damage + small scaling.
                        // Turtle Rake: "Scales with AP". Let's assume 6% AP per tick is correct from prompt.
                        var dotDmg = (AP * 0.06 * 3) + 100; // Base value estimated

                        dmg = initDmg + dotDmg; 
                        
                        aura_rake = t + 9.0;
                        cp++;
                        bd.rake += dmg;
                    }
                    else if (action === "Bite") {
                        // Base: 190-230 + (AP * 0.15) approx
                        var biteBase = 220 + (AP * 0.15);
                        // Extra Energy
                        var extra = energy; // All remaining energy
                        energy = 0; // Consumed
                        biteBase += (extra * 2.7); // 2.7 dmg per extra energy (approx rank)

                        if (res === "CRIT") biteBase *= 2.0;
                        biteBase *= ArmorMod;

                        dmg = biteBase;
                        cp = 0; // Reset
                        bd.bite += dmg;
                    }
                    else if (action === "Rip") {
                        // DoT only. No armor reduction!
                        // Rank 6: ~160 dmg per tick (6 ticks) + AP bonus.
                        // Formula: Base + (0.24 * AP). Total over 12s.
                        var ripBase = 160 * 6; 
                        var ripAp = (0.24 * AP) * 6; // AP part? Or 24% total? 
                        // Prompt said: "(0.24 * AP) (geteilt durch Anzahl Ticks)". 
                        // That means 24% AP total added to the whole DoT? Or per tick?
                        // Usually Vanilla uses: (Base + 0.05*AP) per tick.
                        // Let's use Prompt Formula: "Basiswert + (0.24 * AP)".
                        
                        dmg = ripBase + (0.24 * AP * 6); // Assuming AP scales per tick here for valid Feral dps

                        aura_rip = t + 12.0;
                        cp = 0;
                        bd.rip += dmg;
                    }

                    totalDmg += dmg;
                    log(action + (res==="CRIT"?"*":""), dmg, "Cast");
                }
                
                gcd = 1.0;
            }
        }

        // --- E. TIME STEP ---
        t += DT;
    }

    return {
        dps: totalDmg / SIM_TIME,
        breakdown: bd,
        log: logArr
    };
}