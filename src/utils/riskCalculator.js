export const calculateRiskScore = (patient) => {
  let totalScore = 0;

  // Blood Pressure Risk
  const bloodPressureScore = calculateBloodPressureRisk(patient);
  totalScore += bloodPressureScore;

  // Temperature Risk
  const temperatureScore = calculateTemperatureRisk(patient);
  totalScore += temperatureScore;

  // Age Risk
  const ageScore = calculateAgeRisk(patient);
  totalScore += ageScore;

  return totalScore;
};

export const calculateBloodPressureRisk = (patient) => {
  // Check for invalid/missing data
  if (!patient.vitalSigns || !patient.vitalSigns.bloodPressure) {
    return 0; // Invalid/Missing Data
  }

  const bp = patient.vitalSigns.bloodPressure;
  
  // Parse blood pressure string (e.g., "150/90")
  if (typeof bp === 'string' && bp.includes('/')) {
    const [systolicStr, diastolicStr] = bp.split('/');
    
    // Check for missing parts (e.g., "150/" or "/90")
    if (!systolicStr || !diastolicStr) {
      return 0; // Invalid data
    }
    
    const systolic = parseInt(systolicStr);
    const diastolic = parseInt(diastolicStr);

    // Check for non-numeric values
    if (isNaN(systolic) || isNaN(diastolic)) {
      return 0; // Invalid data
    }

    // Check for INVALID or N/A values
    if (systolicStr === 'INVALID' || diastolicStr === 'INVALID' ||
        systolicStr === 'N/A' || diastolicStr === 'N/A') {
      return 0;
    }

    // Stage 2 (Systolic ≥140 OR Diastolic ≥90)
    if (systolic >= 140 || diastolic >= 90) {
      return 4;
    }
    // Stage 1 (Systolic 130-139 OR Diastolic 80-89)
    else if ((systolic >= 130 && systolic <= 139) || (diastolic >= 80 && diastolic <= 89)) {
      return 3;
    }
    // Elevated (Systolic 120-129 AND Diastolic <80)
    else if (systolic >= 120 && systolic <= 129 && diastolic < 80) {
      return 2;
    }
    // Normal (Systolic <120 AND Diastolic <80)
    else if (systolic < 120 && diastolic < 80) {
      return 1;
    }
    // Any other valid reading that doesn't fit categories gets 1 point (Normal)
    else {
      return 1;
    }
  }

  return 0; // Default for invalid data
};

export const calculateTemperatureRisk = (patient) => {
  // Check for invalid/missing data
  if (!patient.vitalSigns || patient.vitalSigns.temperature === null || 
      patient.vitalSigns.temperature === undefined || patient.vitalSigns.temperature === '') {
    return 0; // Invalid/Missing Data
  }

  const temp = parseFloat(patient.vitalSigns.temperature);

  // Check for non-numeric values or specific invalid values
  if (isNaN(temp) || patient.vitalSigns.temperature === 'TEMP_ERROR' || 
      patient.vitalSigns.temperature === 'invalid') {
    return 0;
  }

  // High Fever (≥101.0°F)
  if (temp >= 101.0) {
    return 2;
  }
  // Low Fever (99.6-100.9°F)
  else if (temp >= 99.6 && temp <= 100.9) {
    return 1;
  }
  // Normal (≤99.5°F)
  else if (temp <= 99.5) {
    return 0;
  }

  return 0; // Default
};

export const calculateAgeRisk = (patient) => {
  // Check for invalid/missing data
  if (patient.age === null || patient.age === undefined || patient.age === '') {
    return 0; // Invalid/Missing Data
  }

  // Check for non-numeric strings first
  if (typeof patient.age === 'string') {
    const lowerAge = patient.age.toLowerCase();
    if (lowerAge.includes('fifty') || lowerAge.includes('unknown') || 
        isNaN(parseInt(patient.age))) {
      return 0;
    }
  }

  const age = parseInt(patient.age);

  // Check if parsing resulted in NaN
  if (isNaN(age)) {
    return 0;
  }

  // Over 65 (>65 years)
  if (age > 65) {
    return 2;
  }
  // 40-65 (40-65 years, inclusive)
  else if (age >= 40 && age <= 65) {
    return 1;
  }
  // Under 40 (<40 years)
  else if (age < 40) {
    return 0;
  }

  return 0; // Default
};

export const checkForAlerts = (patient) => {
  const alerts = [];

  // Check for high-risk conditions (score ≥ 4)
  const riskScore = calculateRiskScore(patient);
  if (riskScore >= 4) {
    alerts.push({
      type: 'high_risk',
      message: `High risk patient (score: ${riskScore})`,
      patientId: patient.id
    });
  }

  // Check for fever (temperature ≥ 99.6°F)
  if (patient.vitalSigns && patient.vitalSigns.temperature) {
    const temp = parseFloat(patient.vitalSigns.temperature);
    if (!isNaN(temp) && temp >= 99.6) {
      alerts.push({
        type: 'fever',
        message: `Fever detected (${temp}°F)`,
        patientId: patient.id
      });
    }
  }

  // Check for data quality issues
  const dataQualityIssues = [];
  
  // Missing or invalid blood pressure
  if (!patient.vitalSigns || !patient.vitalSigns.bloodPressure) {
    dataQualityIssues.push('missing blood pressure');
  } else {
    const bp = patient.vitalSigns.bloodPressure;
    if (typeof bp === 'string' && bp.includes('/')) {
      const [systolic, diastolic] = bp.split('/');
      if (!systolic || !diastolic || isNaN(parseInt(systolic)) || isNaN(parseInt(diastolic))) {
        dataQualityIssues.push('invalid blood pressure');
      }
    } else {
      dataQualityIssues.push('malformed blood pressure');
    }
  }
  
  // Missing or invalid age
  if (patient.age === null || patient.age === undefined || patient.age === '') {
    dataQualityIssues.push('missing age');
  } else if (typeof patient.age === 'string' && (isNaN(parseInt(patient.age)) || 
             patient.age.toLowerCase().includes('unknown') || 
             patient.age.toLowerCase().includes('fifty'))) {
    dataQualityIssues.push('invalid age');
  }
  
  // Missing or invalid temperature
  if (!patient.vitalSigns || patient.vitalSigns.temperature === null || 
      patient.vitalSigns.temperature === undefined || patient.vitalSigns.temperature === '') {
    dataQualityIssues.push('missing temperature');
  } else if (isNaN(parseFloat(patient.vitalSigns.temperature)) ||
             patient.vitalSigns.temperature === 'TEMP_ERROR' ||
             patient.vitalSigns.temperature === 'invalid') {
    dataQualityIssues.push('invalid temperature');
  }

  if (dataQualityIssues.length > 0) {
    alerts.push({
      type: 'data_quality',
      message: `Data quality issues: ${dataQualityIssues.join(', ')}`,
      patientId: patient.id
    });
  }

  return alerts;
};