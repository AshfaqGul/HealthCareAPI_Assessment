const API_KEY = process.env.REACT_APP_API_KEY;
const BASE_URL = 'https://assessment.ksensetech.com';

// Exponential backoff with jitter
const wait = (ms, jitter = true) => {
  const delay = jitter ? ms + Math.random() * 1000 : ms;
  return new Promise(resolve => setTimeout(resolve, delay));
};

export const fetchPatients = async (page = 1, limit = 20, retries = 3) => {
  let lastError;
  
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(`${BASE_URL}/api/patients?page=${page}&limit=${limit}`, {
        headers: {
          'x-api-key': API_KEY
        }
      });

      if (response.ok) {
        const data = await response.json();
        return data;
      }

      // Handle specific error codes
      if (response.status === 429) {
        // Rate limited - use exponential backoff
        const backoffTime = Math.min(3000 * Math.pow(2, attempt), 12000); // Max 12 seconds
        console.log(`Rate limited on page ${page}, waiting ${backoffTime/1000} seconds...`);
        await wait(backoffTime);
        continue;
      } else if (response.status === 503) {
        // Service unavailable - wait and retry
        const backoffTime = 2000 * Math.pow(1.5, attempt);
        console.log(`Service unavailable on page ${page}, waiting ${backoffTime/1000} seconds...`);
        await wait(backoffTime);
        continue;
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      lastError = error;
      if (attempt === retries - 1) {
        throw error;
      }
      console.log(`Attempt ${attempt + 1} failed, retrying...`);
      await wait(1000 * Math.pow(1.5, attempt));
    }
  }
  
  throw lastError || new Error('Failed to fetch patients after all retries');
};

// Fetch a single page of patients
export const fetchPatientsPage = async (page = 1, limit = 10) => {
  console.log(`Fetching page ${page} with ${limit} patients...`);
  
  try {
    const response = await fetchPatients(page, limit, 3);
    
    if (!response || !response.data) {
      throw new Error('Invalid response structure');
    }
    
    return {
      patients: response.data,
      totalPatients: response.pagination?.total || 0,
      totalPages: response.pagination?.totalPages || 1,
      currentPage: response.pagination?.page || page,
      hasNext: response.pagination?.hasNext || false,
      hasPrevious: response.pagination?.hasPrevious || false
    };
  } catch (error) {
    console.error(`Error fetching page ${page}:`, error);
    throw error;
  }
};

// Legacy function for backward compatibility
export const fetchAllPatients = async (maxPatients = 50) => {
  let allPatients = [];
  let page = 1;
  let hasMore = true;
  let consecutiveErrors = 0;
  const maxConsecutiveErrors = 3;
  const patientsPerPage = 20;
  
  // Start with a longer initial delay to avoid immediate rate limiting
  console.log('Starting patient fetch with initial delay...');
  await wait(1000);

  while (hasMore && allPatients.length < maxPatients) {
    try {
      console.log(`Fetching page ${page}... (${allPatients.length}/${maxPatients} patients)`);
      const response = await fetchPatients(page, patientsPerPage);
      
      // Reset error counter on success
      consecutiveErrors = 0;
      
      // Check if response exists and has data
      if (!response || !response.data) {
        console.warn(`Invalid response structure on page ${page}`);
        hasMore = false;
        break;
      }
      
      if (response.data.length > 0) {
        // Only take the patients we need to reach maxPatients
        const patientsNeeded = maxPatients - allPatients.length;
        const patientsToAdd = response.data.slice(0, patientsNeeded);
        allPatients = [...allPatients, ...patientsToAdd];
        
        // Check if we have enough patients
        if (allPatients.length >= maxPatients) {
          console.log(`Reached target of ${maxPatients} patients.`);
          hasMore = false;
        } else {
          // Check pagination info
          if (response.pagination) {
            hasMore = response.pagination.hasNext;
            page++;
          } else {
            hasMore = false;
          }
        }
        
        // Progressive delay strategy based on success
        if (hasMore) {
          // Increase delay after each successful request to avoid rate limits
          const delayMs = Math.min(2000 + (page - 1) * 1000, 5000); // 2s, 3s, 4s, 5s max
          console.log(`Waiting ${delayMs/1000}s before next request...`);
          await wait(delayMs);
        }
      } else {
        hasMore = false;
      }
    } catch (error) {
      console.error(`Error fetching page ${page}:`, error);
      consecutiveErrors++;
      
      if (consecutiveErrors >= maxConsecutiveErrors) {
        console.error(`Too many consecutive errors (${consecutiveErrors}). Stopping.`);
        if (allPatients.length > 0) {
          console.log(`Returning ${allPatients.length} patients fetched so far.`);
          break;
        } else {
          throw new Error('Unable to fetch any patients due to API errors');
        }
      }
      
      // Longer wait after errors
      const errorDelay = Math.min(3000 * consecutiveErrors, 10000);
      console.log(`Waiting ${errorDelay/1000} seconds before next attempt...`);
      await wait(errorDelay);
    }
  }

  console.log(`Total patients fetched: ${allPatients.length}`);
  return allPatients;
};

// Alternative: Fetch exactly what we need with better rate limit handling
export const fetchPatientsCarefully = async (targetCount = 100) => {
  const allPatients = [];
  const patientsPerPage = 20; // API limit is 20
  const maxPages = Math.ceil(targetCount / patientsPerPage);
  
  console.log(`Planning to fetch ${targetCount} patients across ${maxPages} pages...`);
  
  for (let page = 1; page <= maxPages; page++) {
    // Wait longer between requests to avoid rate limits
    if (page > 1) {
      const delay = 4000 + (page - 1) * 2000; // 4s, 6s, 8s, 10s, etc.
      console.log(`Waiting ${delay/1000}s before fetching page ${page}...`);
      await wait(delay);
    }
    
    try {
      const limit = Math.min(patientsPerPage, targetCount - allPatients.length);
      console.log(`Fetching page ${page} (limit: ${limit})...`);
      const response = await fetchPatients(page, limit, 5); // More retries
      
      if (response && response.data) {
        allPatients.push(...response.data);
        console.log(`Successfully fetched ${response.data.length} patients. Total: ${allPatients.length}`);
        
        // Check if we have enough or if there are no more pages
        if (allPatients.length >= targetCount || 
            (response.pagination && !response.pagination.hasNext)) {
          break;
        }
      }
    } catch (error) {
      console.error(`Failed to fetch page ${page}:`, error);
      // Continue with what we have
      if (allPatients.length > 0) {
        console.log(`Continuing with ${allPatients.length} patients after error.`);
      }
    }
  }
  
  console.log(`Fetch complete. Total patients: ${allPatients.length}`);
  return allPatients.slice(0, targetCount);
};

// Submit assessment results
export const submitAssessment = async (assessmentData) => {
  console.log('Submitting assessment:', assessmentData);
  
  try {
    const response = await fetch(`${BASE_URL}/api/submit-assessment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY
      },
      body: JSON.stringify(assessmentData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new Error(errorData?.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Error submitting assessment:', error);
    throw error;
  }
};