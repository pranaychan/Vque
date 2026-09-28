const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

// Shared fetch wrapper: attaches the auth token, sends JSON, and turns
// non-2xx responses into thrown errors so every page can just try/catch.
async function request(endpoint, { authToken, ...fetchOptions } = {}) {
    const token = authToken ?? localStorage.getItem("access_token");
    const headers = {
        "Content-Type": "application/json",
        ...fetchOptions.headers
    };

    if (token && !headers.Authorization) {
        headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${API_URL}${endpoint}`, { ...fetchOptions, headers });

    let data;
    try {
        data = await response.json();
    } catch {
        data = {};
    }

    if (!response.ok) {
        if (response.status === 401 && token === localStorage.getItem("access_token")) {
            localStorage.removeItem("access_token");
        }
        throw new Error(data.detail || "Something went wrong");
    }
    return data;
}

export function getApiUrl() {
    return API_URL;
}

// Restaurant authentication
export async function signup(restaurant) {
    return request("/auth/signup", { method: "POST", body: JSON.stringify(restaurant) });
}

export async function verifyEmail(email, code) {
    return request("/auth/verify-email", { method: "POST", body: JSON.stringify({ email, code }) });
}

export async function resendVerification(email) {
    return request("/auth/resend-verification", { method: "POST", body: JSON.stringify({ email }) });
}

export async function login(restaurant) {
    return request("/auth/login", { method: "POST", body: JSON.stringify(restaurant) });
}

export async function demoLogin() {
    return request("/auth/demo-login", { method: "POST" });
}

export async function forgotPassword(email) {
    return request("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) });
}

export async function resetPassword(token, password) {
    return request("/auth/reset-password", { method: "POST", body: JSON.stringify({ token, password }) });
}

export async function getRestaurant() {
    return request("/restaurants/me");
}

// Locations
export async function getLocations() {
    return request("/locations/");
}

export async function createLocation(location) {
    return request("/locations/", { method: "POST", body: JSON.stringify(location) });
}

export async function deleteLocation(locationId) {
    return request(`/locations/${locationId}`, { method: "DELETE" });
}

// Queues (restaurant dashboard)
export async function getQueues(locationId) {
    return request(`/queues/${locationId}`);
}

export async function createQueue(locationId, queue) {
    return request(`/queues/${locationId}`, { method: "POST", body: JSON.stringify(queue) });
}

export async function deleteQueue(queueId) {
    return request(`/queues/${queueId}`, { method: "DELETE" });
}

export async function updateQueueStatus(queueId, status) {
    return request(`/queues/${queueId}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
}

export async function updateQueueEntry(queueId, entryId, action) {
    return request(`/queues/${queueId}/entries/${entryId}/${action}`, { method: "PATCH" });
}

export async function getManageQueueEntries(queueId) {
    return request(`/queue-entries/manage/${queueId}`);
}

// Public / customer-facing queue access
export async function getPublicQueue(queueId) {
    return request(`/queues/${queueId}/public`);
}

export async function joinQueue(queueId, customer) {
    return request(`/queue-entries/${queueId}`, { method: "POST", body: JSON.stringify(customer) });
}

export async function getEntry(entryId, queueSessionToken) {
    return request(`/queue-entries/entry/${entryId}`, { authToken: queueSessionToken });
}

export async function leaveQueue(entryId, queueSessionToken) {
    return request(`/queue-entries/entry/${entryId}`, { method: "DELETE", authToken: queueSessionToken });
}

// Customer phone OTP
export async function sendOtp(phoneNumber) {
    return request("/otp/send", { method: "POST", body: JSON.stringify({ phone_number: phoneNumber }) });
}

export async function verifyOtp(phoneNumber, code) {
    return request("/otp/verify", { method: "POST", body: JSON.stringify({ phone_number: phoneNumber, code }) });
}
