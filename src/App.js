import React, { useState, useEffect } from 'react';
import './App.css';
import { fetchPatientsPage, submitAssessment, fetchPatientsCarefully } from './services/api';
import { 
  calculateRiskScore, 
  checkForAlerts,
  calculateBloodPressureRisk,
  calculateTemperatureRisk,
  calculateAgeRisk 
} from './utils/riskCalculator';
import mockPatients from './mockData/patients.json';

function App() {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [currentView, setCurrentView] = useState('table');
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalPatients, setTotalPatients] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrevious, setHasPrevious] = useState(false);
  
  const PATIENTS_PER_PAGE = 10;
  
  // Submission state
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submissionResult, setSubmissionResult] = useState(null);
  const [collectingData, setCollectingData] = useState(false);

  useEffect(() => {
    loadPage(currentPage);
  }, [currentPage]);

  const loadPage = async (page) => {
    try {
      setLoading(true);
      setError(null);
      
      // Check if we should use mock data
      const useMockData = process.env.REACT_APP_USE_MOCK_DATA === 'true';
      
      if (useMockData) {
        // Simulate pagination with mock data
        await new Promise(resolve => setTimeout(resolve, 300));
        const startIndex = (page - 1) * PATIENTS_PER_PAGE;
        const endIndex = startIndex + PATIENTS_PER_PAGE;
        const paginatedData = mockPatients.data.slice(startIndex, endIndex);
        
        setPatients(paginatedData);
        setTotalPatients(mockPatients.data.length);
        setTotalPages(Math.ceil(mockPatients.data.length / PATIENTS_PER_PAGE));
        setHasNext(page < Math.ceil(mockPatients.data.length / PATIENTS_PER_PAGE));
        setHasPrevious(page > 1);
      } else {
        // Fetch from API - only 10 patients at a time
        const data = await fetchPatientsPage(page, PATIENTS_PER_PAGE);
        setPatients(data.patients);
        setTotalPatients(data.totalPatients);
        setTotalPages(data.totalPages);
        setHasNext(data.hasNext);
        setHasPrevious(data.hasPrevious);
      }
    } catch (err) {
      setError(err.message);
      setPatients([]);
    } finally {
      setLoading(false);
    }
  };

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages && !loading) {
      setCurrentPage(newPage);
    }
  };

  const getRiskData = () => {
    return patients.map(patient => {
      // Transform data to match risk calculator expectations
      const transformedPatient = {
        id: patient.patient_id,
        name: patient.name,
        age: patient.age,
        gender: patient.gender,
        vitalSigns: {
          bloodPressure: patient.blood_pressure,
          temperature: patient.temperature
        }
      };
      return {
        patient_id: patient.patient_id,
        name: patient.name,
        risk_score: calculateRiskScore(transformedPatient),
        risk_level: getRiskLevel(calculateRiskScore(transformedPatient))
      };
    });
  };

  const getRiskLevel = (score) => {
    if (score >= 4) return 'High';
    if (score >= 2) return 'Moderate';
    return 'Low';
  };

  const getAlerts = () => {
    const alerts = [];
    patients.forEach(patient => {
      // Transform data to match risk calculator expectations
      const transformedPatient = {
        id: patient.patient_id,
        name: patient.name,
        age: patient.age,
        gender: patient.gender,
        vitalSigns: {
          bloodPressure: patient.blood_pressure,
          temperature: patient.temperature
        }
      };
      const alertReasons = checkForAlerts(transformedPatient);
      alertReasons.forEach(alert => {
        alerts.push({
          patient_id: patient.patient_id,
          name: patient.name,
          alert_reason: alert.message,
          alert_type: alert.type
        });
      });
    });
    return alerts;
  };

  const getSummaryData = () => {
    const riskData = getRiskData();
    const currentPagePatients = patients.length;
    
    const high = riskData.filter(p => p.risk_level === 'High').length;
    const moderate = riskData.filter(p => p.risk_level === 'Moderate').length;
    const low = riskData.filter(p => p.risk_level === 'Low').length;

    // Calculate common risk factors for current page
    let highBP = 0;
    let highAge = 0;
    let highTemp = 0;

    patients.forEach(patient => {
      // Check blood pressure
      if (patient.blood_pressure && typeof patient.blood_pressure === 'string' && patient.blood_pressure.includes('/')) {
        const [systolic, diastolic] = patient.blood_pressure.split('/').map(v => parseInt(v));
        if (!isNaN(systolic) && !isNaN(diastolic) && (systolic >= 140 || diastolic >= 90)) {
          highBP++;
        }
      }
      // Check age
      if (patient.age && parseInt(patient.age) >= 65) {
        highAge++;
      }
      // Check temperature (fever)
      if (patient.temperature && parseFloat(patient.temperature) >= 99.6) {
        highTemp++;
      }
    });

    return {
      currentPagePatients,
      totalPatients,
      riskBreakdown: { high, moderate, low },
      commonFactors: {
        highBloodPressure: currentPagePatients > 0 ? ((highBP / currentPagePatients) * 100).toFixed(1) : '0',
        advancedAge: currentPagePatients > 0 ? ((highAge / currentPagePatients) * 100).toFixed(1) : '0',
        fever: currentPagePatients > 0 ? ((highTemp / currentPagePatients) * 100).toFixed(1) : '0'
      }
    };
  };

  const collectAllPatientsData = async () => {
    setCollectingData(true);
    setError(null);
    
    try {
      const useMockData = process.env.REACT_APP_USE_MOCK_DATA === 'true';
      let allPatientsData = [];
      
      if (useMockData) {
        // Use all mock data
        allPatientsData = mockPatients.data;
      } else {
        // Fetch all patients from API (up to 50)
        allPatientsData = await fetchPatientsCarefully(50);
      }
      
      // Process all patients to identify categories
      const highRiskPatients = [];
      const feverPatients = [];
      const dataQualityIssues = [];
      
      // Debug: Log patient analysis
      console.log('=== PATIENT ANALYSIS ===');
      console.log(`Total patients to analyze: ${allPatientsData.length}`);
      
      allPatientsData.forEach(patient => {
        const transformedPatient = {
          id: patient.patient_id,
          name: patient.name,
          age: patient.age,
          gender: patient.gender,
          vitalSigns: {
            bloodPressure: patient.blood_pressure,
            temperature: patient.temperature
          }
        };
        
        // Calculate risk score
        const riskScore = calculateRiskScore(transformedPatient);
        
        // Debug logging - log ALL high risk patients for debugging
        if (riskScore >= 4) {
          const bpScore = calculateBloodPressureRisk(transformedPatient);
          const tempScore = calculateTemperatureRisk(transformedPatient);
          const ageScore = calculateAgeRisk(transformedPatient);
          
          console.log(`HIGH RISK - Patient ${patient.patient_id}:`, {
            age: patient.age,
            ageScore: ageScore,
            bp: patient.blood_pressure,
            bpScore: bpScore,
            temp: patient.temperature,
            tempScore: tempScore,
            totalRiskScore: riskScore,
            breakdown: `BP(${bpScore}) + Temp(${tempScore}) + Age(${ageScore}) = ${riskScore}`
          });
        }
        
        if (riskScore >= 4) {
          highRiskPatients.push(patient.patient_id);
        }
        
        // Check for fever (temperature >= 99.6°F)
        if (patient.temperature && parseFloat(patient.temperature) >= 99.6 && !isNaN(parseFloat(patient.temperature))) {
          feverPatients.push(patient.patient_id);
        }
        
        // Check for data quality issues
        const alerts = checkForAlerts(transformedPatient);
        const hasDataQualityIssue = alerts.some(alert => alert.type === 'data_quality');
        if (hasDataQualityIssue) {
          dataQualityIssues.push(patient.patient_id);
        }
      });
      
      // Debug summary
      console.log('=== ANALYSIS SUMMARY ===');
      console.log(`High Risk Patients (≥4): ${highRiskPatients.length}`);
      console.log(`Fever Patients (≥99.6°F): ${feverPatients.length}`);
      console.log(`Data Quality Issues: ${dataQualityIssues.length}`);
      
      return {
        high_risk_patients: highRiskPatients,
        fever_patients: feverPatients,
        data_quality_issues: dataQualityIssues
      };
    } catch (err) {
      setError('Failed to collect patient data: ' + err.message);
      throw err;
    } finally {
      setCollectingData(false);
    }
  };

  const handleSubmitAssessment = async () => {
    try {
      setSubmitting(true);
      setError(null);
      
      // Collect all patient data
      const assessmentData = await collectAllPatientsData();
      
      // Submit to API
      const result = await submitAssessment(assessmentData);
      
      setSubmissionResult(result);
      setShowSubmitModal(true);
    } catch (err) {
      setError('Submission failed: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && patients.length === 0) {
    return (
      <div className="App">
        <h1>Healthcare API Assessment</h1>
        <div className="loading">Loading patients...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="App">
        <h1>Healthcare API Assessment</h1>
        <div className="error">Error: {error}</div>
        <button onClick={() => loadPage(currentPage)}>Retry</button>
      </div>
    );
  }

  const riskData = getRiskData();
  const alerts = getAlerts();
  const summary = getSummaryData();

  return (
    <div className="App">
      <h1>Healthcare API Assessment</h1>
      
      <div className="nav-buttons">
        <button 
          onClick={() => setCurrentView('table')} 
          className={currentView === 'table' ? 'active' : ''}
        >
          Patient List
        </button>
        <button 
          onClick={() => setCurrentView('alerts')} 
          className={currentView === 'alerts' ? 'active' : ''}
        >
          Alerts ({alerts.length})
        </button>
        <button 
          onClick={() => setCurrentView('summary')} 
          className={currentView === 'summary' ? 'active' : ''}
        >
          Summary
        </button>
        <button 
          onClick={handleSubmitAssessment} 
          className="submit-button"
          disabled={submitting || collectingData}
        >
          {submitting || collectingData ? 'Processing...' : 'Submit Assessment'}
        </button>
      </div>

      {/* Pagination Controls */}
      <div className="pagination-info">
        <p>
          Showing {((currentPage - 1) * PATIENTS_PER_PAGE) + 1}-
          {Math.min(currentPage * PATIENTS_PER_PAGE, totalPatients)} of {totalPatients} patients
        </p>
      </div>

      <div className="pagination-controls">
        <button 
          onClick={() => handlePageChange(1)} 
          disabled={currentPage === 1 || loading}
        >
          First
        </button>
        <button 
          onClick={() => handlePageChange(currentPage - 1)} 
          disabled={!hasPrevious || loading}
        >
          Previous
        </button>
        <span className="page-info">
          Page {currentPage} of {totalPages}
        </span>
        <button 
          onClick={() => handlePageChange(currentPage + 1)} 
          disabled={!hasNext || loading}
        >
          Next
        </button>
        <button 
          onClick={() => handlePageChange(totalPages)} 
          disabled={currentPage === totalPages || loading}
        >
          Last
        </button>
      </div>

      {loading && (
        <div className="loading-overlay">Loading page {currentPage}...</div>
      )}

      {currentView === 'table' && (
        <div className="table-container">
          <h2>Patient Risk Assessment</h2>
          <table>
            <thead>
              <tr>
                <th>Patient ID</th>
                <th>Name</th>
                <th>Age</th>
                <th>Gender</th>
                <th>Blood Pressure</th>
                <th>Temperature</th>
                <th>Risk Score</th>
                <th>Risk Level</th>
              </tr>
            </thead>
            <tbody>
              {riskData.map(patient => (
                <tr key={patient.patient_id} className={`risk-${patient.risk_level.toLowerCase()}`}>
                  <td>{patient.patient_id}</td>
                  <td>{patient.name}</td>
                  <td>{patients.find(p => p.patient_id === patient.patient_id)?.age || 'N/A'}</td>
                  <td>{patients.find(p => p.patient_id === patient.patient_id)?.gender || 'N/A'}</td>
                  <td>{patients.find(p => p.patient_id === patient.patient_id)?.blood_pressure || 'N/A'}</td>
                  <td>{patients.find(p => p.patient_id === patient.patient_id)?.temperature || 'N/A'}</td>
                  <td>{patient.risk_score}</td>
                  <td>{patient.risk_level}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {currentView === 'alerts' && (
        <div className="alerts-container">
          <h2>Patient Alerts (Page {currentPage})</h2>
          {alerts.length === 0 ? (
            <p>No alerts found on this page.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Patient ID</th>
                  <th>Name</th>
                  <th>Alert</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((alert, index) => (
                  <tr key={`${alert.patient_id}-${index}`} className={`alert-${alert.alert_type}`}>
                    <td>{alert.patient_id}</td>
                    <td>{alert.name}</td>
                    <td>{alert.alert_reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {currentView === 'summary' && (
        <div className="summary-container">
          <h2>Risk Assessment Summary</h2>
          <div className="summary-content">
            <h3>Current Page ({currentPage} of {totalPages})</h3>
            <p>Showing {summary.currentPagePatients} of {summary.totalPatients} total patients</p>
            
            <h4>Risk Profile Breakdown (Current Page):</h4>
            <ul>
              <li>High Risk (&ge;4): {summary.riskBreakdown.high} patients</li>
              <li>Moderate Risk (2-3): {summary.riskBreakdown.moderate} patients</li>
              <li>Low Risk (&lt;2): {summary.riskBreakdown.low} patients</li>
            </ul>

            <h4>Most Common Risk Factors (Current Page):</h4>
            <ul>
              <li>High Blood Pressure (&ge;140/90): {summary.commonFactors.highBloodPressure}%</li>
              <li>Advanced Age (&gt;65): {summary.commonFactors.advancedAge}%</li>
              <li>Fever (&ge;99.6°F): {summary.commonFactors.fever}%</li>
            </ul>
          </div>
        </div>
      )}

      {/* Submission Results Modal */}
      {showSubmitModal && submissionResult && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2>Assessment Results</h2>
            
            <div className={`result-status ${submissionResult.results?.status === 'PASS' ? 'pass' : 'fail'}`}>
              <h3>{submissionResult.results?.status}: {submissionResult.results?.percentage}%</h3>
              <p>Score: {submissionResult.results?.score?.toFixed(2)} / 100</p>
            </div>

            {submissionResult.results?.breakdown && (
              <div className="breakdown">
                <h4>Score Breakdown:</h4>
                <div className="breakdown-item">
                  <strong>High Risk Patients:</strong>
                  <span>{submissionResult.results.breakdown.high_risk.matches}/{submissionResult.results.breakdown.high_risk.correct} correct 
                  ({submissionResult.results.breakdown.high_risk.submitted} submitted)</span>
                </div>
                <div className="breakdown-item">
                  <strong>Fever Patients:</strong>
                  <span>{submissionResult.results.breakdown.fever.matches}/{submissionResult.results.breakdown.fever.correct} correct 
                  ({submissionResult.results.breakdown.fever.submitted} submitted)</span>
                </div>
                <div className="breakdown-item">
                  <strong>Data Quality Issues:</strong>
                  <span>{submissionResult.results.breakdown.data_quality.matches}/{submissionResult.results.breakdown.data_quality.correct} correct 
                  ({submissionResult.results.breakdown.data_quality.submitted} submitted)</span>
                </div>
              </div>
            )}

            {submissionResult.results?.feedback && (
              <div className="feedback">
                {submissionResult.results.feedback.strengths?.length > 0 && (
                  <>
                    <h4>Strengths:</h4>
                    <ul>
                      {submissionResult.results.feedback.strengths.map((strength, idx) => (
                        <li key={idx}>{strength}</li>
                      ))}
                    </ul>
                  </>
                )}
                
                {submissionResult.results.feedback.issues?.length > 0 && (
                  <>
                    <h4>Areas for Improvement:</h4>
                    <ul>
                      {submissionResult.results.feedback.issues.map((issue, idx) => (
                        <li key={idx}>{issue}</li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}

            <div className="modal-footer">
              <p>Attempt {submissionResult.results?.attempt_number} of 3</p>
              {submissionResult.results?.can_resubmit && (
                <p className="info">You have {submissionResult.results?.remaining_attempts} attempts remaining.</p>
              )}
              <button onClick={() => setShowSubmitModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;