/** @param {NS} ns **/
export async function main(ns) {
	ns.disableLog("ALL");
	if (!ns.gang.inGang() && !joinGang(ns)) {
		ns.tprint("ERROR: Could not create a combat gang. Join an eligible combat faction first.");
		return;
	}

	let territoryWinChance = 1;
	while (true) {
		recruit(ns);
		equipMembers(ns);
		ascend(ns);
		territoryWinChance = territoryWar(ns);
		assignMembers(ns, territoryWinChance);
		await ns.gang.nextUpdate();
	}
}

function territoryWar(ns) {
	const minWinChanceToStartWar = 0.8;
	let gangInfo = ns.gang.getGangInformation();
	// ns.print("Territory: " + gangInfo.territory);
	// sometimes territory is stuck at something like 99.99999999999983%
	// since clash chance takes time to decrease anyways, should not be an issue to stop a bit before 100,000000%
	if (gangInfo.territory < 0.9999) {
		let otherGangInfos = ns.gang.getAllGangInformation();
		let lowestWinChance = 1;
		for (const otherGang of Object.keys(otherGangInfos)) {
			if (otherGang == gangInfo.faction || otherGangInfos[otherGang].territory <= 0) {
				continue;
			}
			lowestWinChance = Math.min(lowestWinChance, ns.gang.getChanceToWinClash(otherGang));
		}
		if (lowestWinChance > minWinChanceToStartWar) {
			if (!gangInfo.territoryWarfareEngaged) {
				ns.print("WARN start territory warfare");
				ns.toast("Start territory warfare");
				ns.gang.setTerritoryWarfare(true);
			}
			ns.print("Territory win chance: " + lowestWinChance);
		}
		return lowestWinChance;
	}

	if (gangInfo.territoryWarfareEngaged) {
		ns.print("WARN stop territory warfare");
		ns.toast("Stop territory warfare");
		ns.gang.setTerritoryWarfare(false);
	}
	return 1;
}

function ascend(ns) {
	let members = ns.gang.getMemberNames();
	for (let member of members) {
		let memberInfo = ns.gang.getMemberInformation(member);
		let memberCombatStats = (memberInfo.str + memberInfo.def + memberInfo.dex + memberInfo.agi) / 4;
		//ns.print("Member combat stats: " + memberCombatStats);
		let memberAscensionMultiplier = (memberInfo.agi_asc_mult + memberInfo.def_asc_mult + memberInfo.dex_asc_mult + memberInfo.str_asc_mult) / 4;
		//ns.print("Member ascension multiplier: " + memberAscensionMultiplier);
		let memberAscensionResult = ns.gang.getAscensionResult(member);
		if (memberAscensionResult != undefined) {
			let memberAscensionResultMultiplier = (memberAscensionResult.agi + memberAscensionResult.def + memberAscensionResult.dex + memberAscensionResult.str) / 4;
			//ns.print("Member ascension result: " + memberNewAscensionMultiplier);
			if ((memberAscensionResultMultiplier > 1.3)) {
				ns.print("Ascent gang member " + member);
				ns.gang.ascendMember(member);
			}
		}
	}
}

function equipMembers(ns) {
	let members = ns.gang.getMemberNames();
	for (let member of members) {
		let memberInfo = ns.gang.getMemberInformation(member);
		for (let equipment of combatEquipment(ns)) {
			if (memberInfo.upgrades.includes(equipment) || memberInfo.augmentations.includes(equipment)) {
				continue;
			}
			if (ns.gang.getEquipmentCost(equipment) < (0.01 * ns.getServerMoneyAvailable("home"))) {
				ns.print("Purchase equipment for " + member + ": " + equipment);
				ns.gang.purchaseEquipment(member, equipment);
			}
		}
	}
}

function assignMembers(ns, territoryWinChance) {
	let members = ns.gang.getMemberNames();
	members.sort((a, b) => memberCombatStats(ns, b) - memberCombatStats(ns, a));
	let gangInfo = ns.gang.getGangInformation();
	let hasFormulas = ns.fileExists("Formulas.exe", "home");
	let workJobs = Math.floor((members.length) / 2);
	let wantedLevelIncrease = 0;
	for (let member of members) {
		let highestTaskValue = 0;
		let highestValueTask = "Train Combat";
		let memberInfo = ns.gang.getMemberInformation(member);

		if (workJobs > 0 && gangInfo.territory < 1 && members.length >= 12 && territoryWinChance < 0.95) {
			// support territory warfare if max team size, not at max territory yet and win chance not high enough yet
			workJobs--;
			highestValueTask = "Territory Warfare";
		}
		else if (memberCombatStats(ns, member) < 50) {
			highestValueTask = "Train Combat";
		}
		else if (workJobs > 0 && wantedLevelIncrease > 0) {
			workJobs--;
			highestValueTask = "Vigilante Justice";
			if (hasFormulas) {
				wantedLevelIncrease += ns.formulas.gang.wantedLevelGain(gangInfo, memberInfo, ns.gang.getTaskStats(highestValueTask));
			}
		}
		else if (workJobs > 0 && memberCombatStats(ns, member) > 50) {
			workJobs--;
			if (hasFormulas) {
				for (const task of tasks) {
					let value = taskValue(ns, gangInfo, member, task);
					if (value > highestTaskValue) {
						highestTaskValue = value;
						highestValueTask = task;
					}
				}
				wantedLevelIncrease += ns.formulas.gang.wantedLevelGain(gangInfo, memberInfo, ns.gang.getTaskStats(highestValueTask));
			}
			else {
				highestValueTask = fallbackTask(gangInfo);
			}
		}


		if (memberInfo.task != highestValueTask) {
			ns.print("Assign " + member + " to " + highestValueTask);
			ns.gang.setMemberTask(member, highestValueTask);
		}
	}
}

function taskValue(ns, gangInfo, member, task) {
	// determine money and reputation gain for a task
	let respectGain = ns.formulas.gang.respectGain(gangInfo, ns.gang.getMemberInformation(member), ns.gang.getTaskStats(task));
	let moneyGain = ns.formulas.gang.moneyGain(gangInfo, ns.gang.getMemberInformation(member), ns.gang.getTaskStats(task));
	let wantedLevelIncrease = ns.formulas.gang.wantedLevelGain(gangInfo, ns.gang.getMemberInformation(member), ns.gang.getTaskStats(task));
	let vigilanteWantedDecrease = ns.formulas.gang.wantedLevelGain(gangInfo, ns.gang.getMemberInformation(member), ns.gang.getTaskStats("Vigilante Justice"));
	if ( wantedLevelIncrease + vigilanteWantedDecrease > 0){
		// avoid tasks where more than one vigilante justice is needed to compensate
		return 0;
	}
	else if ( (2 * wantedLevelIncrease) + vigilanteWantedDecrease > 0){
		// Simple compensation for wanted level since we need more vigilante then
		// ToDo: Could be a more sophisticated formula here
		moneyGain *= 0.75;
	}

	if (ns.getServerMoneyAvailable("home") > 10e12) {
		// if we got all augmentations, money from gangs is probably not relevant anymore; so focus on respect
		// set money gain at least to respect gain in case of low money gain tasks like terrorism
		moneyGain /= 100; // compare money to respect gain value; give respect more priority
		moneyGain = Math.max(moneyGain, respectGain);
	}
	
	// return a value based on money gain and respect gain
	return respectGain * moneyGain;
}

function memberCombatStats(ns, member) {
	let memberInfo = ns.gang.getMemberInformation(member);
	return (memberInfo.str + memberInfo.def + memberInfo.dex + memberInfo.agi) / 4;
}


function recruit(ns) {
	if (ns.gang.canRecruitMember()) {
		let members = ns.gang.getMemberNames();
		let memberName = "Thug-" + members.length;
		ns.print("Recruit new gang member " + memberName);
		ns.gang.recruitMember(memberName);
	}
}

function joinGang(ns) {
	for (const myGang of combatGangs) {
		if (ns.gang.createGang(myGang)) {
			return true;
		}
	}
	return false;
}

const tasks = ["Mug People", "Deal Drugs", "Strongarm Civilians", "Run a Con", "Armed Robbery", "Traffick Illegal Arms", "Threaten & Blackmail", "Human Trafficking", "Terrorism"];

function combatEquipment(ns) {
	return ns.gang.getEquipmentNames().filter((equipment) => {
		let stats = ns.gang.getEquipmentStats(equipment);
		return stats.str || stats.def || stats.dex || stats.agi;
	});
}

function fallbackTask(gangInfo) {
	if (gangInfo.wantedPenalty < 0.9 || gangInfo.wantedLevelGainRate > 0) {
		return "Vigilante Justice";
	}
	if (gangInfo.territory < 0.5) {
		return "Terrorism";
	}
	return "Human Trafficking";
}

const combatGangs = ["Speakers for the Dead", "The Dark Army", "The Syndicate", "Tetrads", "Slum Snakes"]