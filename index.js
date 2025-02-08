/**
 * @typedef {{ color: string, nuts: boolean }} Product
 * @typedef {{ name: string, timePerUnit: Map<Product, number> }} Machine
 * @typedef {{ product: Product, quantity: number, due: number }} Order
 * @typedef {Map<Machine, Order[]>} Schedule
 *
 * @typedef {{ type: "order", order: Order, duration: number, end: number }} DetailedScheduleOrder
 * @typedef {{ type: "switchover", duration: number, end: number, costly: boolean }} DetailedScheduleSwitchover
 * @typedef {DetailedScheduleOrder | DetailedScheduleSwitchover} DetailedScheduleEntry
 * @typedef {Map<Machine, DetailedScheduleEntry[]>} DetailedSchedule
 *
 * @typedef {Map<Machine, { totalTardiness: number, costlySwitchovers: number, endTime }>} ScheduleMachineScores
 * @typedef {{ totalTardiness: number, costlySwitchovers: number, makespan: number, machinesAtMakespan: number, machineScores: ScheduleMachineScores }} ScheduleScore
 */

// DATA SETUP

const colors = {
  dark: "dark",
  milk: "milk",
  white: "white",
};

/** @type {{ [key: string]: Product }}} */
const products = {
  dark: { color: colors.dark, nuts: false },
  milk: { color: colors.milk, nuts: false },
  white: { color: colors.white, nuts: false },
  darkWithNuts: { color: colors.dark, nuts: true },
  milkWithNuts: { color: colors.milk, nuts: true },
  whiteWithNuts: { color: colors.white, nuts: true },
};

/** @type {Machine[]} */
const machines = [
  ...Array(5)
    .fill(undefined)
    .map(() => ({
      name: "Machine A",
      timePerUnit: new Map([
        [products.dark, 5],
        [products.milk, 4],
        [products.white, 3],
      ]),
    })),
  ...Array(5)
    .fill(undefined)
    .map(() => ({
      name: "Machine B",
      timePerUnit: new Map([
        [products.dark, 4],
        [products.milk, 3],
        [products.white, 2],
        [products.darkWithNuts, 8],
        [products.milkWithNuts, 6],
        [products.whiteWithNuts, 4],
      ]),
    })),
];

const machinesPerProduct = new Map(
  Object.values(products).map((product) => [
    product,
    new Set(machines.filter((machine) => machine.timePerUnit.has(product))),
  ])
);

/** @type {Order[]} */
let orders;

/** @type {Schedule} */
let currentSchedule;

/** @type {ScheduleScore} */
let currentScheduleScore;

/** @type {{ schedule: Schedule, score: ScheduleScore }[]} */
let scheduleHistory;

/** @type {number} */
let currentScheduleHistoryIndex;

// INITIALIZATION LOGIC

/**
 * @param {{ nuts: boolean }} options
 */
function getRandomProduct({ nuts }) {
  const relevantProducts = Object.values(products).filter(
    (product) => product.nuts === nuts
  );

  return relevantProducts[Math.floor(Math.random() * relevantProducts.length)];
}

function getRandomOrderQuantity() {
  return Math.floor(Math.random() * 10) + 1;
}

function getRandomOrderDueDate() {
  return Math.floor(Math.random() * 1000) + 1;
}

function generateRandomOrders() {
  orders = [
    ...Array(150)
      .fill(undefined)
      .map(() => ({
        product: getRandomProduct({ nuts: false }),
        quantity: getRandomOrderQuantity(),
        due: getRandomOrderDueDate(),
      })),
    ...Array(50)
      .fill(undefined)
      .map(() => ({
        product: getRandomProduct({ nuts: true }),
        quantity: getRandomOrderQuantity(),
        due: getRandomOrderDueDate(),
      })),
  ];
}

function initializeScheduleAndHistory() {
  currentSchedule = new Map(machines.map((machine) => [machine, []]));

  currentScheduleScore = {
    totalTardiness: 0,
    costlySwitchovers: 0,
    makespan: 0,
    machinesAtMakespan: 0,
    machineScores: new Map(
      machines.map((machine) => [
        machine,
        { totalTardiness: 0, costlySwitchovers: 0, endTime: 0 },
      ])
    ),
  };

  scheduleHistory = [];
  currentScheduleHistoryIndex = -1;
}

// SCHEDULING LOGIC

/**
 * @param {Order} order
 * @param {Machine} machine
 */
function getOrderDurationOnMachine(order, machine) {
  return machine.timePerUnit.get(order.product) * order.quantity;
}

/**
 * @param {Order} currentOrder
 * @param {Order} nextOrder
 */
function getSwitchoverBetweenOrders(currentOrder, nextOrder) {
  const expensiveColorSwitch =
    currentOrder.product.color !== colors.white &&
    nextOrder.product.color === colors.white;

  const switchToAllergenFree =
    currentOrder.product.nuts && !nextOrder.product.nuts;

  if (expensiveColorSwitch || switchToAllergenFree) {
    return { duration: 25, costly: true };
  }

  return { duration: 5, costly: false };
}

/**
 * @param {Schedule} schedule
 */
function calculateDetailedSchedule(schedule) {
  /** @type {DetailedSchedule} */
  const detailedSchedule = new Map();

  for (const [machine, orders] of schedule) {
    /** @type {DetailedScheduleEntry[]} */
    const detailedEntries = [];

    let endTime = 0;
    let previousOrder = undefined;

    for (const order of orders) {
      if (previousOrder) {
        const switchover = getSwitchoverBetweenOrders(previousOrder, order);
        endTime = endTime + switchover.duration;

        detailedEntries.push({
          type: "switchover",
          duration: switchover.duration,
          end: endTime,
          costly: switchover.costly,
        });
      }

      const processingTime = getOrderDurationOnMachine(order, machine);
      endTime = endTime + processingTime;

      detailedEntries.push({
        type: "order",
        order,
        duration: getOrderDurationOnMachine(order, machine),
        end: endTime,
      });

      previousOrder = order;
    }

    detailedSchedule.set(machine, detailedEntries);
  }

  return detailedSchedule;
}

/**
 * @param {Schedule} schedule
 * @param {{ previousScore: ScheduleScore, changedMachines: Machine[] }} [calculationInfo]
 * @returns {ScheduleScore}
 */
function calculateScheduleScore(schedule, calculationInfo) {
  /** @type {ScheduleMachineScores} */
  const machineScores = new Map();

  for (const [machine, orders] of schedule) {
    // prefer reusing already-calculated data that did not change
    if (calculationInfo && !calculationInfo.changedMachines.includes(machine)) {
      machineScores.set(
        machine,
        calculationInfo.previousScore.machineScores.get(machine)
      );
      continue;
    }

    let totalTardiness = 0;
    let costlySwitchovers = 0;
    let endTime = 0;
    let previousOrder = undefined;

    for (const order of orders) {
      if (previousOrder) {
        const switchover = getSwitchoverBetweenOrders(previousOrder, order);
        endTime = endTime + switchover.duration;

        if (switchover.costly) {
          costlySwitchovers++;
        }
      }

      const processingTime = getOrderDurationOnMachine(order, machine);
      endTime = endTime + processingTime;

      if (order.due < endTime) {
        totalTardiness = totalTardiness + (endTime - order.due);
      }

      previousOrder = order;
    }

    machineScores.set(machine, { totalTardiness, costlySwitchovers, endTime });
  }

  let totalTardiness = 0;
  let costlySwitchovers = 0;
  let makespan = 0;

  for (const machineScore of machineScores.values()) {
    totalTardiness = totalTardiness + machineScore.totalTardiness;
    costlySwitchovers = costlySwitchovers + machineScore.costlySwitchovers;
    makespan = Math.max(makespan, machineScore.endTime);
  }

  const machinesAtMakespan = [...machineScores.values()].filter(
    (machineScore) => machineScore.endTime === makespan
  ).length;

  return {
    totalTardiness,
    costlySwitchovers,
    makespan,
    machinesAtMakespan,
    machineScores,
  };
}

/**
 * @param {ScheduleScore} currentScore
 * @param {ScheduleScore} newScore
 */
function isScoreImprovement(currentScore, newScore) {
  if (newScore.totalTardiness < currentScore.totalTardiness) {
    return true;
  } else if (newScore.totalTardiness > currentScore.totalTardiness) {
    return false;
  }

  if (newScore.makespan < currentScore.makespan) {
    return true;
  } else if (newScore.makespan > currentScore.makespan) {
    return false;
  }

  if (newScore.costlySwitchovers < currentScore.costlySwitchovers) {
    return true;
  } else if (newScore.costlySwitchovers > currentScore.costlySwitchovers) {
    return false;
  }

  if (newScore.machinesAtMakespan < currentScore.machinesAtMakespan) {
    return true;
  }

  return false;
}

/**
 * @param {Schedule} schedule
 * @param {Order} order
 * @param {Machine} selectedMachine
 * @param {number} index
 */
function insertOrder(
  schedule,
  order,
  selectedMachine,
  index = schedule.get(selectedMachine).length
) {
  /** @type {Schedule} */
  const newSchedule = new Map();

  for (const [machine, currentOrders] of schedule) {
    if (machine === selectedMachine) {
      const adjustedOrders = [...currentOrders];
      adjustedOrders.splice(index, 0, order);
      newSchedule.set(machine, adjustedOrders);
    } else {
      newSchedule.set(machine, currentOrders);
    }
  }

  return newSchedule;
}

/**
 * @param {Schedule} schedule
 * @param {Machine} selectedMachine
 * @param {number} index
 */
function removeOrder(schedule, selectedMachine, index) {
  /** @type {Schedule} */
  const newSchedule = new Map();

  for (const [machine, currentOrders] of schedule) {
    if (machine === selectedMachine) {
      const adjustedOrders = [...currentOrders];
      adjustedOrders.splice(index, 1);
      newSchedule.set(machine, adjustedOrders);
    } else {
      newSchedule.set(machine, currentOrders);
    }
  }

  return newSchedule;
}

/**
 * @param {Schedule} newCurrentSchedule
 */
function updateCurrentSchedule(newCurrentSchedule) {
  currentSchedule = newCurrentSchedule;
  currentScheduleScore = calculateScheduleScore(currentSchedule);
  scheduleHistory.push({
    schedule: currentSchedule,
    score: currentScheduleScore,
  });
  currentScheduleHistoryIndex++;
}

function getSortedOrders() {
  return [...orders].sort((a, b) => {
    const numberMachinesA = machinesPerProduct.get(a.product).size;
    const numberMachinesB = machinesPerProduct.get(b.product).size;

    if (numberMachinesA !== numberMachinesB) {
      return numberMachinesA - numberMachinesB;
    }

    return a.due - b.due;
  });
}

/**
 * @param {Order[]} sortedOrders
 */
function insertOrdersAtBestPosition(sortedOrders) {
  for (const order of sortedOrders) {
    /** @type {ScheduleScore} */
    let bestScore = undefined;

    /** @type {Schedule} */
    let bestSchedule = undefined;

    for (const machine of machinesPerProduct.get(order.product)) {
      for (let i = 0; i <= currentSchedule.get(machine).length; i++) {
        const newSchedule = insertOrder(currentSchedule, order, machine, i);

        const newScore = calculateScheduleScore(newSchedule, {
          previousScore: currentScheduleScore,
          changedMachines: [machine],
        });

        if (!bestScore || isScoreImprovement(bestScore, newScore)) {
          bestScore = newScore;
          bestSchedule = newSchedule;
        }
      }
    }

    updateCurrentSchedule(bestSchedule);
  }
}

function getImprovedSchedule() {
  /** @type {Schedule} */
  let bestSchedule = currentSchedule;

  /** @type {ScheduleScore} */
  let bestScore = currentScheduleScore;

  // select orders where it actually make sense to touch them
  const detailedSchedule = calculateDetailedSchedule(currentSchedule);
  const relevantOrders = new Set();

  for (const [machine, entries] of detailedSchedule) {
    // select all orders on the most-used machine(s)
    if (entries[entries.length - 1].end === currentScheduleScore.makespan) {
      for (const order of currentSchedule.get(machine)) {
        relevantOrders.add(order);
      }

      continue;
    }

    let beforeOverdueOrder = false;

    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];

      // select orders that are overdue or that are before an overdue order
      if (entry.type === "order") {
        if (beforeOverdueOrder) {
          relevantOrders.add(entry.order);
        } else if (entry.end > entry.order.due) {
          relevantOrders.add(entry.order);
          beforeOverdueOrder = true;
        }
      }

      // select orders before and after costly switchovers
      if (entry.type === "switchover" && entry.costly) {
        const orderEntryBefore = /** @type {DetailedScheduleOrder} */ (
          entries[i - 1]
        );
        const orderEntryAfter = /** @type {DetailedScheduleOrder} */ (
          entries[i + 1]
        );

        relevantOrders.add(orderEntryBefore.order);
        relevantOrders.add(orderEntryAfter.order);
      }
    }
  }

  for (const [machineA, ordersA] of currentSchedule) {
    for (const [indexA, orderA] of ordersA.entries()) {
      if (!relevantOrders.has(orderA)) {
        continue;
      }

      // attempt to insert order in a different location
      const scheduleWithoutA = removeOrder(currentSchedule, machineA, indexA);

      const scoreWithoutA = calculateScheduleScore(scheduleWithoutA, {
        previousScore: currentScheduleScore,
        changedMachines: [machineA],
      });

      for (const machine of machinesPerProduct.get(orderA.product)) {
        const numberOrdersOnMachine = scheduleWithoutA.get(machine).length;

        for (let i = 0; i <= numberOrdersOnMachine; i++) {
          if (machine === machineA && i === indexA) {
            continue;
          }

          const newSchedule = insertOrder(scheduleWithoutA, orderA, machine, i);

          const newScore = calculateScheduleScore(newSchedule, {
            previousScore: scoreWithoutA,
            changedMachines: [machine],
          });

          if (isScoreImprovement(bestScore, newScore)) {
            bestScore = newScore;
            bestSchedule = newSchedule;
          }
        }
      }

      // attempt to swap two orders
      for (const [machineB, ordersB] of currentSchedule) {
        for (const [indexB, orderB] of ordersB.entries()) {
          const swapPossible =
            orderA !== orderB &&
            machinesPerProduct.get(orderA.product).has(machineB) &&
            machinesPerProduct.get(orderB.product).has(machineA);

          if (!swapPossible) {
            continue;
          }

          let newSchedule = currentSchedule;

          if (indexA < indexB) {
            newSchedule = removeOrder(newSchedule, machineB, indexB);
            newSchedule = removeOrder(newSchedule, machineA, indexA);
            newSchedule = insertOrder(newSchedule, orderB, machineA, indexA);
            newSchedule = insertOrder(newSchedule, orderA, machineB, indexB);
          } else {
            newSchedule = removeOrder(newSchedule, machineA, indexA);
            newSchedule = removeOrder(newSchedule, machineB, indexB);
            newSchedule = insertOrder(newSchedule, orderA, machineB, indexB);
            newSchedule = insertOrder(newSchedule, orderB, machineA, indexA);
          }

          const newScore = calculateScheduleScore(newSchedule, {
            previousScore: currentScheduleScore,
            changedMachines: [machineA, machineB],
          });

          if (isScoreImprovement(bestScore, newScore)) {
            bestScore = newScore;
            bestSchedule = newSchedule;
          }
        }
      }
    }
  }

  if (bestSchedule !== currentSchedule) {
    return bestSchedule;
  }
}

function optimizeSchedule() {
  const improvedSchedule = getImprovedSchedule();

  if (improvedSchedule) {
    updateCurrentSchedule(improvedSchedule);
    renderScores();
    setTimeout(optimizeSchedule);
  } else {
    // local optimum reached
    renderPage();
  }
}

// RUN CONSTRUCTION ALGORITHM AND ITERATIVE OPTIMIZATION

let lastPreOptimizationScheduleHistoryIndex;

function generateSchedule() {
  initializeScheduleAndHistory();

  const sortedOrders = getSortedOrders();
  insertOrdersAtBestPosition(sortedOrders);

  lastPreOptimizationScheduleHistoryIndex = scheduleHistory.length - 1;
  renderScores();
  renderSchedule();

  setTimeout(optimizeSchedule);
}

generateRandomOrders();
generateSchedule();

// VISUALIZATION LOGIC

function renderScores() {
  const historyEntry = scheduleHistory[currentScheduleHistoryIndex];

  const numberOrdersScheduled = Math.min(
    currentScheduleHistoryIndex + 1,
    orders.length
  );

  document.getElementById(
    "ordersScheduled"
  ).textContent = `${numberOrdersScheduled}/${orders.length}`;

  document.getElementById("optimizationIteration").textContent = `${
    currentScheduleHistoryIndex > lastPreOptimizationScheduleHistoryIndex
      ? currentScheduleHistoryIndex - lastPreOptimizationScheduleHistoryIndex
      : "/"
  }`;

  document.getElementById(
    "totalTardiness"
  ).textContent = `${historyEntry.score.totalTardiness}`;

  document.getElementById(
    "makespan"
  ).textContent = `${historyEntry.score.makespan}`;

  document.getElementById(
    "costlySwitchovers"
  ).textContent = `${historyEntry.score.costlySwitchovers}`;

  document.getElementById(
    "machinesAtMakespan"
  ).textContent = `${historyEntry.score.machinesAtMakespan}`;
}

function renderSchedule() {
  const historyEntry = scheduleHistory[currentScheduleHistoryIndex];
  const detailedSchedule = calculateDetailedSchedule(historyEntry.schedule);

  const ganttChart = /** @type {HTMLTableElement} */ (
    document.getElementById("ganttChart")
  );

  ganttChart.innerHTML = "";

  const timeLength = 800;

  const spacerRow = ganttChart.insertRow();
  spacerRow.insertCell();

  for (let i = 0; i < timeLength; i++) {
    spacerRow.insertCell();
  }

  const timeRow = ganttChart.insertRow();
  timeRow.insertCell();

  for (let i = 0; i < timeLength; i = i + 50) {
    const timeBlockCell = timeRow.insertCell();
    timeBlockCell.colSpan = 50;
    timeBlockCell.textContent = i.toString();
  }

  for (const [machine, entries] of detailedSchedule) {
    const machineRow = ganttChart.insertRow();
    const nameCell = machineRow.insertCell();
    nameCell.textContent = machine.name;

    let endTime = 0;

    for (const entry of entries) {
      const entryCell = machineRow.insertCell();
      entryCell.colSpan = entry.duration;
      endTime = endTime + entry.duration;

      if (entry.type === "switchover") {
        entryCell.title = `Duration:${entry.duration}\nEnd:${endTime}`;

        if (entry.costly) {
          entryCell.classList.add("switchover-costly");
        } else {
          entryCell.classList.add("switchover-normal");
        }
      } else {
        entryCell.title = `Duration:${entry.duration}\nDue:${entry.order.due}\nEnd:${endTime}`;

        if (entry.order.product.color === colors.dark) {
          entryCell.classList.add("chocolate-dark");
        } else if (entry.order.product.color === colors.milk) {
          entryCell.classList.add("chocolate-milk");
        } else {
          entryCell.classList.add("chocolate-white");
        }

        if (entry.order.product.nuts) {
          entryCell.classList.add("with-nuts");
        }

        if (endTime > entry.order.due) {
          entryCell.classList.add("order-overdue");
        }
      }
    }
  }
}

function updateButtonStates() {
  const previousPossible = currentScheduleHistoryIndex > 0;
  const nextPossible = currentScheduleHistoryIndex < scheduleHistory.length - 1;

  const firstButton = /** @type {HTMLButtonElement} */ (
    document.getElementById("firstButton")
  );
  const previousButton = /** @type {HTMLButtonElement} */ (
    document.getElementById("previousButton")
  );
  const preOptimizationButton = /** @type {HTMLButtonElement} */ (
    document.getElementById("preOptimizationButton")
  );
  const nextButton = /** @type {HTMLButtonElement} */ (
    document.getElementById("nextButton")
  );
  const lastButton = /** @type {HTMLButtonElement} */ (
    document.getElementById("lastButton")
  );

  firstButton.disabled = !previousPossible;
  previousButton.disabled = !previousPossible;
  preOptimizationButton.disabled =
    currentScheduleHistoryIndex === lastPreOptimizationScheduleHistoryIndex;
  nextButton.disabled = !nextPossible;
  lastButton.disabled = !nextPossible;
}

function renderPage() {
  renderScores();
  renderSchedule();
  updateButtonStates();
}

function showFirst() {
  currentScheduleHistoryIndex = 0;
  renderPage();
}

function showPrevious() {
  if (currentScheduleHistoryIndex > 0) {
    currentScheduleHistoryIndex--;
    renderPage();
  }
}

function showPreOptimization() {
  currentScheduleHistoryIndex = lastPreOptimizationScheduleHistoryIndex;
  renderPage();
}

function showNext() {
  if (currentScheduleHistoryIndex < scheduleHistory.length - 1) {
    currentScheduleHistoryIndex++;
    renderPage();
  }
}

function showLast() {
  currentScheduleHistoryIndex = scheduleHistory.length - 1;
  renderPage();
}

addEventListener("keydown", function (event) {
  if (event.key === "Home") {
    showFirst();
    event.preventDefault(); // prevent Home from scrolling to the top
  } else if (event.key === "ArrowLeft") {
    showPrevious();
    event.preventDefault(); // prevent Left Arrow from scrolling to the left
  } else if (event.key === " ") {
    showPreOptimization();
    event.preventDefault(); // prevent Space from scrolling down or triggering last-clicked button
  } else if (event.key === "ArrowRight") {
    showNext();
    event.preventDefault(); // prevent Right Arrow from scrolling to the right
  } else if (event.key === "End") {
    showLast();
    event.preventDefault(); // prevent End from scrolling to the bottom
  }
});
