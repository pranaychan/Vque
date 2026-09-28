// Same rules the backend enforces (see backend/schemas.py: check_password_strength).
// Used to show live feedback while the user is typing their password.
export function getPasswordChecks(password) {
    return {
        length: password.length >= 8,
        upper: /[A-Z]/.test(password),
        lower: /[a-z]/.test(password),
        number: /[0-9]/.test(password),
        special: /[^A-Za-z0-9]/.test(password),
        repeat: !/(.)\1\1/.test(password)
    };
}
