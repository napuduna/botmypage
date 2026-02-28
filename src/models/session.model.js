const mongoose = require('mongoose');

/**
 * Session Schema
 * เก็บ state และ temporary data ของ conversation
 */
const sessionSchema = new mongoose.Schema(
  {
    // Facebook ID
    facebookId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    // State Machine States:
    // INIT - เริ่มต้น
    // WAIT_TYPE_SELECTION - รอเลือกประเภท
    // WAIT_DETAIL - รอรายละเอียด
    // COMPLETED - เสร็จสิ้น
    state: {
      type: String,
      enum: ['INIT', 'WAIT_TYPE_SELECTION', 'WAIT_DETAIL', 'COMPLETED'],
      default: 'INIT',
    },

    // ข้อมูลชั่วคราว
    tempData: {
      type: {
        selectedType: String, // 'student' | 'real'
        responses: mongoose.Schema.Types.Mixed, // เก็บข้อมูลเก่า
      },
      default: {},
    },

    // นับจำนวนข้อความ
    messageCount: {
      type: Number,
      default: 0,
    },

    // Timeout: ปิด session หลังจาก 24 ชั่วโมง
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 24 * 60 * 60 * 1000),
      index: { expires: 0 },
    },
  },
  {
    timestamps: true, // createdAt, updatedAt
  }
);

module.exports = mongoose.model('Session', sessionSchema);
