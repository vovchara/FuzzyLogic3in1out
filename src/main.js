// Крок 1: Визначення вхідних та вихідних змінних
// Вхідні змінні
let connectionStrength;
let responseTime;
let energyConsumption;

// Вихідна змінна
let securityRiskLevel;

// Функції належності для сили з'єднання (CS)
function membershipCS(value) {
    return {
        L: Math.max(0, Math.min((40 - value) / 20, 1)),
        M: Math.max(0, Math.min((value - 20) / 20, (60 - value) / 20)),
        H: Math.max(0, Math.min((value - 40) / 20, 1))
    };
}

// Функції належності для часу відгуку (RT)
function membershipRT(value) {
    return {
        L: Math.max(0, Math.min((50 - value) / 20, 1)),
        M: Math.max(0, Math.min((value - 30) / 20, (70 - value) / 20)),
        H: Math.max(0, Math.min((value - 50) / 20, 1))
    };
}

// Функції належності для споживання енергії (EC)
function membershipEC(value) {
    return {
        L: Math.max(0, Math.min((30 - value) / 20, 1)),
        M: Math.max(0, Math.min((value - 10) / 20, (50 - value) / 20)),
        H: Math.max(0, Math.min((value - 30) / 20, 1))
    };
}

// Функції належності для рівня ризику безпеки (SR)
function membershipSR(value) {
    return {
        VL: Math.max(0, Math.min((50 - value) / 25, 1)),
        L: Math.max(0, Math.min((value - 25) / 25, (75 - value) / 25)),
        M: Math.max(0, Math.min((value - 50) / 25, (100 - value) / 25)),
        H: Math.max(0, Math.min((value - 75) / 25, (125 - value) / 25)),
        VH: Math.max(0, Math.min((value - 100) / 25, 1))
    };
}

// Крок 4: Створення бази правил
// База правил
const rules = [
    { CS: 'Low', RT: 'Low', EC: 'Low', SR: 'High' },
    { CS: 'Low', RT: 'Low', EC: 'Medium', SR: 'High' },
    { CS: 'Low', RT: 'Low', EC: 'High', SR: 'High' },
    { CS: 'Low', RT: 'Medium', EC: 'Low', SR: 'High' },
    { CS: 'Low', RT: 'Medium', EC: 'Medium', SR: 'Very High' },
    { CS: 'Low', RT: 'Medium', EC: 'High', SR: 'Very High' },
    { CS: 'Low', RT: 'High', EC: 'Low', SR: 'High' },
    { CS: 'Low', RT: 'High', EC: 'Medium', SR: 'Very High' },
    { CS: 'Low', RT: 'High', EC: 'High', SR: 'Very High' },
    { CS: 'Medium', RT: 'Low', EC: 'Low', SR: 'Very Low' },
    { CS: 'Medium', RT: 'Low', EC: 'Medium', SR: 'Medium' },
    { CS: 'Medium', RT: 'Low', EC: 'High', SR: 'Medium' },
    { CS: 'Medium', RT: 'Medium', EC: 'Low', SR: 'Low' },
    { CS: 'Medium', RT: 'Medium', EC: 'Medium', SR: 'Medium' },
    { CS: 'Medium', RT: 'Medium', EC: 'High', SR: 'High' },
    { CS: 'Medium', RT: 'High', EC: 'Low', SR: 'Medium' },
    { CS: 'Medium', RT: 'High', EC: 'Medium', SR: 'Medium' },
    { CS: 'Medium', RT: 'High', EC: 'High', SR: 'Very High' },
    { CS: 'High', RT: 'Low', EC: 'Low', SR: 'Very Low' },
    { CS: 'High', RT: 'Low', EC: 'Medium', SR: 'Very Low' },
    { CS: 'High', RT: 'Low', EC: 'High', SR: 'Low' },
    { CS: 'High', RT: 'Medium', EC: 'Low', SR: 'Very Low' },
    { CS: 'High', RT: 'Medium', EC: 'Medium', SR: 'Very Low' },
    { CS: 'High', RT: 'Medium', EC: 'High', SR: 'Low' },
    { CS: 'High', RT: 'High', EC: 'Low', SR: 'Low' },
    { CS: 'High', RT: 'High', EC: 'Medium', SR: 'Low' },
    { CS: 'High', RT: 'High', EC: 'High', SR: 'Low' }
];

// Крок 5: Реалізація фазі-контролера на JavaScript
// Фузифікація
function fuzzify(input, membershipFunction) {
    return membershipFunction(input);
}

// Дефазифікація
// function defuzzify(fuzzyOutput) {
function defuzzify(fuzzyOutput) {
    let numerator = 0;
    let denominator = 0;
    const values = {
        VL: 25,
        L: 50,
        M: 75,
        H: 100,
        VH: 125
    };

    for (let key in fuzzyOutput) {
        numerator += fuzzyOutput[key] * values[key];
        denominator += fuzzyOutput[key];
    }
    return denominator === 0 ? 0 : numerator / denominator;
}

function fuzzyController(CS, RT, EC) {
    const fuzzyCS = membershipCS(CS);
    const fuzzyRT = membershipRT(RT);
    const fuzzyEC = membershipEC(EC);

    // Застосування правил
    let fuzzySR = { VL: 0, L: 0, M: 0, H: 0, VH: 0 };
    rules.forEach(rule => {
        const csDegree = fuzzyCS[convertToKey(rule.CS)];
        const rtDegree = fuzzyRT[convertToKey(rule.RT)];
        const ecDegree = fuzzyEC[convertToKey(rule.EC)];
        // log
        //   console.log(`csDegree: ecDegree=${csDegree}`);
        // console.log(`rtDegree: ecDegree=${rtDegree}`);
        // console.log(`ecDegree: ecDegree=${ecDegree}`);

        const minDegree = Math.min(csDegree, rtDegree, ecDegree);

        if (rule.SR === 'Very Low') fuzzySR.VL = Math.max(fuzzySR.VL, minDegree);
        if (rule.SR === 'Low') fuzzySR.L = Math.max(fuzzySR.L, minDegree);
        if (rule.SR === 'Medium') fuzzySR.M = Math.max(fuzzySR.M, minDegree);
        if (rule.SR === 'High') fuzzySR.H = Math.max(fuzzySR.H, minDegree);
        if (rule.SR === 'Very High') fuzzySR.VH = Math.max(fuzzySR.VH, minDegree);
    });

    return defuzzify(fuzzySR);
}

// Функція для конвертації значень з правил у ключі для функцій належності
function convertToKey(value) {
    switch (value) {
        case 'Low':
            return 'L';
        case 'Medium':
            return 'M';
        case 'High':
            return 'H';
        case 'Very Low':
            return 'VL';
        case 'Very High':
            return 'VH';
        default:
            return '';
    }
}

const testData = [
    { CS: 30, RT: 40, EC: 20, expected: 100 },
    { CS: 70, RT: 80, EC: 60, expected: 75 },
    { CS: 50, RT: 50, EC: 50, expected: 75 },
    { CS: 90, RT: 30, EC: 10, expected: 25 },
    { CS: 20, RT: 90, EC: 70, expected: 125 },
    { CS: 40, RT: 60, EC: 30, expected: 100 },
    { CS: 60, RT: 70, EC: 40, expected: 75 },
    { CS: 80, RT: 20, EC: 90, expected: 50 },
    { CS: 25, RT: 35, EC: 45, expected: 100 },
    { CS: 55, RT: 65, EC: 75, expected: 125 },
    { CS: 85, RT: 95, EC: 85, expected: 50 },
    { CS: 35, RT: 45, EC: 55, expected: 100 },
    { CS: 65, RT: 75, EC: 65, expected: 75 },
    { CS: 95, RT: 85, EC: 25, expected: 50 }
];

// Перевірка роботи контролера
testData.forEach(data => {
    const result = fuzzyController(data.CS, data.RT, data.EC);
    const isCorrect = result === data.expected;
    console.log(`Input: CS=${data.CS}, RT=${data.RT}, EC=${data.EC} => SR=${result} (Expected: ${data.expected}) - ${isCorrect ? 'Correct' : 'Incorrect'}`);
});