// Form Validation Utility
class FormValidator {
    constructor() {
        this.rules = {
            username: {
                required: true,
                minLength: 3,
                maxLength: 30,
                pattern: /^[a-zA-Z0-9_]+$/,
                message: 'Username must be 3-30 characters and contain only letters, numbers, and underscores'
            },
            email: {
                required: true,
                pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                message: 'Please enter a valid email address'
            },
            password: {
                required: true,
                minLength: 6,
                maxLength: 100,
                message: 'Password must be at least 6 characters long'
            }
        };
    }

    validateField(fieldName, value) {
        const rule = this.rules[fieldName];
        if (!rule) return { valid: true };

        const errors = [];

        if (rule.required && (!value || (typeof value === 'string' && !value.trim()))) {
            errors.push(`${this.getFieldLabel(fieldName)} is required`);
        } else if (value) {
            if (rule.minLength && value.length < rule.minLength) {
                errors.push(`${this.getFieldLabel(fieldName)} must be at least ${rule.minLength} characters`);
            }
            if (rule.maxLength && value.length > rule.maxLength) {
                errors.push(`${this.getFieldLabel(fieldName)} must be no more than ${rule.maxLength} characters`);
            }
            if (rule.pattern && !rule.pattern.test(value)) {
                errors.push(rule.message || `${this.getFieldLabel(fieldName)} format is invalid`);
            }
        }

        return {
            valid: errors.length === 0,
            errors: errors
        };
    }

    validateForm(formData) {
        const errors = {};
        let isValid = true;

        Object.keys(formData).forEach(fieldName => {
            const validation = this.validateField(fieldName, formData[fieldName]);
            if (!validation.valid) {
                errors[fieldName] = validation.errors;
                isValid = false;
            }
        });

        return {
            valid: isValid,
            errors: errors
        };
    }

    getFieldLabel(fieldName) {
        const labels = {
            username: 'Username',
            email: 'Email',
            password: 'Password'
        };
        return labels[fieldName] || fieldName;
    }

    showFieldError(inputElement, errorMessage) {
        this.clearFieldError(inputElement);
        
        inputElement.classList.add('input-error');
        
        const errorDiv = document.createElement('div');
        errorDiv.className = 'field-error';
        errorDiv.textContent = errorMessage;
        errorDiv.setAttribute('role', 'alert');
        
        inputElement.parentElement.appendChild(errorDiv);
    }

    clearFieldError(inputElement) {
        inputElement.classList.remove('input-error');
        const errorDiv = inputElement.parentElement.querySelector('.field-error');
        if (errorDiv) {
            errorDiv.remove();
        }
    }

    showFormError(container, message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = message;
        errorDiv.setAttribute('role', 'alert');
        container.appendChild(errorDiv);
        return errorDiv;
    }

    clearFormError(container) {
        const errorDiv = container.querySelector('.error-message');
        if (errorDiv) {
            errorDiv.remove();
        }
    }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FormValidator;
}

