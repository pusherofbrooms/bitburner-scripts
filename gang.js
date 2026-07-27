const DEFAULTS = {
	moneyWeight: 1,
	respectWeight: 1,
	wantedCleanupStart: 0.95,
	wantedCleanupStop: 0.99,
	equipmentBudget: 0.10,
	equipmentItemLimit: 0.02,
};

/** @param {NS} ns **/
export async function main(ns) {
	const flags = ns.flags([
		["money-weight", DEFAULTS.moneyWeight],
		["respect-weight", DEFAULTS.respectWeight],
		["equipment-budget", DEFAULTS.equipmentBudget],
		["equipment-item-limit", DEFAULTS.equipmentItemLimit],
	]);
	const config = {
		moneyWeight: nonnegativeFlag(flags["money-weight"], DEFAULTS.moneyWeight),
		respectWeight: nonnegativeFlag(flags["respect-weight"], DEFAULTS.respectWeight),
		equipmentBudget: nonnegativeFlag(flags["equipment-budget"], DEFAULTS.equipmentBudget),
		equipmentItemLimit: nonnegativeFlag(flags["equipment-item-limit"], DEFAULTS.equipmentItemLimit),
	};
	if (config.moneyWeight === 0 && config.respectWeight === 0) {
		config.moneyWeight = DEFAULTS.moneyWeight;
		config.respectWeight = DEFAULTS.respectWeight;
	}
	ns.disableLog("ALL");
	if (!ns.gang.inGang() && !joinGang(ns)) {
		ns.tprint("ERROR: Could not create a combat gang. Join an eligible combat faction first.");
		return;
	}

	let territoryWinChance = 1;
	let cleaningWanted = false;
	while (true) {
		recruit(ns);
		equipMembers(ns, config);
		ascend(ns);
		territoryWinChance = territoryWar(ns);
		const wantedPenalty = ns.gang.getGangInformation().wantedPenalty;
		if (!cleaningWanted && wantedPenalty <= DEFAULTS.wantedCleanupStart) cleaningWanted = true;
		else if (cleaningWanted && wantedPenalty >= DEFAULTS.wantedCleanupStop) cleaningWanted = false;
		assignMembers(ns, territoryWinChance, cleaningWanted, config);
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

function equipMembers(ns, config) {
	let members = ns.gang.getMemberNames();
	const availableMoney = ns.getServerMoneyAvailable("home");
	let updateBudget = availableMoney * config.equipmentBudget;
	const itemLimit = availableMoney * config.equipmentItemLimit;
	for (let member of members) {
		let memberInfo = ns.gang.getMemberInformation(member);
		for (let equipment of combatEquipment(ns)) {
			if (memberInfo.upgrades.includes(equipment) || memberInfo.augmentations.includes(equipment)) {
				continue;
			}
			const cost = ns.gang.getEquipmentCost(equipment);
			if (cost <= itemLimit && cost <= updateBudget) {
				ns.print("Purchase equipment for " + member + ": " + equipment);
				if (ns.gang.purchaseEquipment(member, equipment)) updateBudget -= cost;
			}
		}
	}
}

function assignMembers(ns, territoryWinChance, cleaningWanted, config) {
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
		else if (workJobs > 0 && cleaningWanted && (wantedLevelIncrease >= 0 || !hasFormulas)) {
			workJobs--;
			highestValueTask = "Vigilante Justice";
			if (hasFormulas) {
				wantedLevelIncrease += ns.formulas.gang.wantedLevelGain(gangInfo, memberInfo, ns.gang.getTaskStats(highestValueTask));
			}
		}
		else if (workJobs > 0 && memberCombatStats(ns, member) > 50) {
			workJobs--;
			if (hasFormulas) {
				const taskMetrics = tasks.map((task) => taskGains(ns, gangInfo, member, task, cleaningWanted));
				const maxMoney = Math.max(1, ...taskMetrics.map((value) => value.money));
				const maxRespect = Math.max(1, ...taskMetrics.map((value) => value.respect));
				for (const value of taskMetrics) {
					const score = config.moneyWeight * value.money / maxMoney
						+ config.respectWeight * value.respect / maxRespect;
					if (value.allowed && score > highestTaskValue) {
						highestTaskValue = score;
						highestValueTask = value.task;
					}
				}
				wantedLevelIncrease += ns.formulas.gang.wantedLevelGain(gangInfo, memberInfo, ns.gang.getTaskStats(highestValueTask));
			}
			else {
				highestValueTask = fallbackTask(gangInfo, cleaningWanted);
			}
		}


		if (memberInfo.task != highestValueTask) {
			ns.print("Assign " + member + " to " + highestValueTask);
			ns.gang.setMemberTask(member, highestValueTask);
		}
	}
}

function taskGains(ns, gangInfo, member, task, cleaningWanted) {
	// determine money and reputation gain for a task
	let respectGain = ns.formulas.gang.respectGain(gangInfo, ns.gang.getMemberInformation(member), ns.gang.getTaskStats(task));
	let moneyGain = ns.formulas.gang.moneyGain(gangInfo, ns.gang.getMemberInformation(member), ns.gang.getTaskStats(task));
	if (cleaningWanted) {
		let wantedLevelIncrease = ns.formulas.gang.wantedLevelGain(gangInfo, ns.gang.getMemberInformation(member), ns.gang.getTaskStats(task));
		let vigilanteWantedDecrease = ns.formulas.gang.wantedLevelGain(gangInfo, ns.gang.getMemberInformation(member), ns.gang.getTaskStats("Vigilante Justice"));
		if (wantedLevelIncrease + vigilanteWantedDecrease > 0) {
			// avoid tasks where more than one vigilante justice is needed to compensate
			return { task, money: 0, respect: 0, allowed: false };
		}
		else if ((2 * wantedLevelIncrease) + vigilanteWantedDecrease > 0) {
			// Simple compensation for wanted level since we need more vigilante then
			// ToDo: Could be a more sophisticated formula here
			moneyGain *= 0.75;
		}
	}

	return { task, money: Math.max(0, moneyGain), respect: Math.max(0, respectGain), allowed: true };
}

function nonnegativeFlag(value, fallback) {
	const numericValue = Number(value);
	return Number.isFinite(numericValue) ? Math.max(0, numericValue) : fallback;
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
		if (excludedEquipment.includes(equipment)) {
			return false;
		}
		let stats = ns.gang.getEquipmentStats(equipment);
		return stats.str || stats.def || stats.dex || stats.agi;
	});
}

function fallbackTask(gangInfo, cleaningWanted) {
	if (cleaningWanted) {
		return "Vigilante Justice";
	}
	if (gangInfo.territory < 0.5) {
		return "Terrorism";
	}
	return "Human Trafficking";
}

const excludedEquipment = ["BitWire", "Neuralstimulator", "DataJack"];

const combatGangs = ["Speakers for the Dead", "The Dark Army", "The Syndicate", "Tetrads", "Slum Snakes"];