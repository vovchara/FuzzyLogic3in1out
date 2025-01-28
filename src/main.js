// Крок 1: Визначення вхідних та вихідних змінних
// Вхідні змінні
let connectionStrength;
let responseTime;
let energyConsumption;

// Вихідна змінна
let securityRiskLevel;

function membershipCS(value) {
    let low = 0;
    if (value <= 20) {
        low = 1;
    }
    if (value > 20 && value <= 40) {
        low = (40 - value) / 20;
    }
    if (value > 40) {
        low = 0;
    }

    let medium = 0;
    if (value <= 20) {
        medium = 0;
    }
    if (value > 20 && value <= 40) {
        medium = (value - 20) / 20;
    }
    if (value > 40 && value <= 60) {
        medium = 1;
    }
    if (value > 60 && value < 80) {
        medium = (80 - value) / 20;
    }
    if (value >= 80) {
        medium = 0;
    }

    let high = 0;
    if (value <= 60) {
        high = 0;
    }
    if (value > 60 && value <= 80) {
        high = (value - 60) / 20;
    }
    if (value > 80) {
        high = 1;
    }
    return {
        L: Math.max(0, low), // Low
        M: Math.max(0, medium), // Medium
        H: Math.max(0, high) // High
    };
}

function membershipRT(value) {
    let low = 0;
    if (value <= 30) {
        low = 1;
    }
    if (value > 30 && value <= 50) {
        low = (50 - value) / 20;
    }
    if (value > 50) {
        low = 0;
    }

    let medium = 0;
    if (value <= 30) {
        medium = 0;
    }
    if (value > 30 && value <= 50) {
        medium = (value - 30) / 20;
    }
    if (value > 50 && value <= 70) {
        medium = 1;
    }
    if (value > 70 && value < 90) {
        medium = (90 - value) / 20;
    }
    if (value >= 90) {
        medium = 0;
    }

    let high = 0;
    if (value <= 70) {
        high = 0;
    }
    if (value > 70 && value <= 90) {
        high = (value - 70) / 20;
    }
    if (value > 90) {
        high = 1;
    }

    return {
        L: Math.max(0, low), // Low
        M: Math.max(0, medium), // Medium
        H: Math.max(0, high) // High
    };
}

function membershipEC(value) {
    let low = 0;
    if (value <= 10) {
        low = 1;
    }
    if (value > 10 && value <= 30) {
        low = (30 - value) / 20;
    }
    if (value > 30) {
        low = 0;
    }

    let medium = 0;
    if (value <= 10) {
        medium = 0;
    }
    if (value > 10 && value <= 30) {
        medium = (value - 10) / 20;
    }
    if (value > 30 && value <= 50) {
        medium = 1;
    }
    if (value > 50 && value < 70) {
        medium = (70 - value) / 20;
    }
    if (value >= 70) {
        medium = 0;
    }

    let high = 0;
    if (value <= 50) {
        high = 0;
    }
    if (value > 50 && value <= 70) {
        high = (value - 50) / 20;
    }
    if (value > 70) {
        high = 1;
    }
    return {
        L: Math.max(0, low), // Low
        M: Math.max(0, medium), // Medium
        H: Math.max(0, high) // High
    };
}

// Функції належності для рівня ризику безпеки (SR)
function membershipSR(value) {
    return {
        VL: Math.max(0, Math.min((25 - value) / 25, 1)), // Very Low
        L: Math.max(0, Math.min((value - 0) / 25, (50 - value) / 25)), // Low
        M: Math.max(0, Math.min((value - 25) / 25, (75 - value) / 25)), // Medium
        H: Math.max(0, Math.min((value - 50) / 25, (100 - value) / 25)), // High
        VH: Math.max(0, Math.min((value - 75) / 25, 1)) // Very High
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

        const minDegree = Math.min(csDegree, rtDegree, ecDegree);

        if (rule.SR === 'Very Low') fuzzySR.VL = Math.max(fuzzySR.VL, minDegree);
        if (rule.SR === 'Low') fuzzySR.L = Math.max(fuzzySR.L, minDegree);
        if (rule.SR === 'Medium') fuzzySR.M = Math.max(fuzzySR.M, minDegree);
        if (rule.SR === 'High') fuzzySR.H = Math.max(fuzzySR.H, minDegree);
        if (rule.SR === 'Very High') fuzzySR.VH = Math.max(fuzzySR.VH, minDegree);
    });

    const maxKey = Object.keys(fuzzySR).reduce((a, b) => fuzzySR[a] > fuzzySR[b] ? a : b);
    return keyToString[maxKey];
}

const keyToString = {
    "VL": "Very low",
    "L": "Low",
    "M": "Medium",
    "H": "High",
    "VH": "Very high"
};

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
    { CS: 10, RT: 10, EC: 10, expected: "High" }, // Rule 1
    { CS: 10, RT: 10, EC: 35, expected: "High" }, // Rule 2
    { CS: 10, RT: 10, EC: 60, expected: "High" }, // Rule 3
    { CS: 10, RT: 25, EC: 10, expected: "High" }, // Rule 4
    { CS: 10, RT: 60, EC: 35, expected: "Very high" }, // Rule 5
    { CS: 10, RT: 60, EC: 60, expected: "Very high" }, // Rule 6
    { CS: 10, RT: 80, EC: 10, expected: "High" }, // Rule 7
    { CS: 10, RT: 80, EC: 35, expected: "Very high" }, // Rule 8
    { CS: 10, RT: 80, EC: 60, expected: "Very high" }, // Rule 9
    { CS: 31, RT: 10, EC: 10, expected: "Very low" }, // Rule 10
    { CS: 31, RT: 10, EC: 35, expected: "Medium" }, // Rule 11
    { CS: 31, RT: 10, EC: 60, expected: "Medium" }, // Rule 12
    { CS: 31, RT: 41, EC: 10, expected: "Low" }, // Rule 13
    { CS: 31, RT: 40, EC: 35, expected: "Medium" }, // Rule 14
    { CS: 31, RT: 40, EC: 60, expected: "High" }, // Rule 15
    { CS: 31, RT: 85, EC: 10, expected: "Medium" }, // Rule 16
    { CS: 31, RT: 70, EC: 35, expected: "Medium" }, // Rule 17
    { CS: 31, RT: 90, EC: 60, expected: "Very high" }, // Rule 18
    { CS: 50, RT: 10, EC: 10, expected: "Very low" }, // Rule 19
    { CS: 80, RT: 10, EC: 35, expected: "Very low" }, // Rule 20
    { CS: 90, RT: 10, EC: 60, expected: "Low" }, // Rule 21
    { CS: 100, RT: 40, EC: 10, expected: "Very low" }, // Rule 22
    { CS: 95, RT: 40, EC: 35, expected: "Very low" }, // Rule 23
    { CS: 88, RT: 40, EC: 60, expected: "Low" }, // Rule 24
    { CS: 89, RT: 88, EC: 10, expected: "Low" }, // Rule 25
    { CS: 91, RT: 92, EC: 35, expected: "Low" }, // Rule 26
    { CS: 92, RT: 70, EC: 60, expected: "Low" } // Rule 27
];

// Перевірка роботи контролера
testData.forEach(data => {
    const result = fuzzyController(data.CS, data.RT, data.EC);
    // const resultLevel = membershipSR(result);
    // const isCorrect = resultLevel === data.expected;
    const isCorrect = result === data.expected;
    console.log(`Input: CS=${data.CS}, RT=${data.RT}, EC=${data.EC} => SR=${result} (Expected: ${data.expected}) - ${isCorrect ? 'Correct' : 'Incorrect'}, Risk Level: ${result}`);
    // console.log(`Input: CS=${data.CS}, RT=${data.RT}, EC=${data.EC} => SR=${result} (Expected: ${data.expected}) - ${isCorrect ? 'Correct' : 'Incorrect'}, Risk Level: ${getRiskLevel(resultLevel)}`);
});
