/**
 * Validator utility
 * ตรวจสอบข้อมูลอินพุต
 */

const validator = {
  /**
   * ตรวจสอบว่าเป็นเลขหรือไม่
   */
  isNumber: (value) => {
    return !isNaN(value) && value !== '';
  },

  /**
   * ตรวจสอบว่าเป็นข้อความหรือไม่
   */
  isString: (value) => {
    return typeof value === 'string' && value.trim().length > 0;
  },

  /**
   * ตรวจสอบว่าเป็นอีเมลหรือไม่
   */
  isEmail: (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  },

  /**
   * ตรวจสอบว่าเป็นเบอร์โทรศัพท์ไทยหรือไม่
   */
  isThaiPhoneNumber: (phone) => {
    const phoneRegex = /^(\+66|0)[0-9]{8,9}$/;
    return phoneRegex.test(phone.replace(/\s/g, ''));
  },

  /**
   * ตรวจสอบว่า string ไม่ว่าง
   */
  isNotEmpty: (value) => {
    return value && value.toString().trim().length > 0;
  },

  /**
   * Length validation
   */
  minLength: (value, min) => {
    return value && value.toString().length >= min;
  },

  maxLength: (value, max) => {
    return value && value.toString().length <= max;
  },
};

module.exports = validator;
