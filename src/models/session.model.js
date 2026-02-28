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
    // SELECT_TYPE - เลือกประเภท (นักศึกษา/ผู้ประกอบการ)
    // SELECT_CATEGORY - เลือกหมวดงาน
    // ENTER_BUDGET - ใส่งบประมาณ
    // SELECT_TIMELINE - เลือกเวลา
    // COMPLETED - เสร็จสิ้น
    state: {
      type: String,
      enum: ['INIT', 'SELECT_TYPE', 'SELECT_CATEGORY', 'ENTER_BUDGET', 'SELECT_TIMELINE', 'COMPLETED'],
      default: 'INIT',
    },

    // ข้อมูลชั่วคราว
    tempData: {
      type: {
        userType: String, // 'student' | 'business'
        category: String, // 'เว็บไซต์', 'โปรแกรม', etc.
        budget: Number, // งบประมาณ
        timeline: String, // '3 วัน', '7 วัน', '14 วัน'
      },
      default: {},
    },

    // นับจำนวนข้อความ
    messageCount: {
      type: Number,
      default: 0,
    },

    // Timeout: 30 นาที
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 30 * 60 * 1000),
      index: { expires: 0 },
    },
  },
  {
    timestamps: true, // createdAt, updatedAt
  }
);

/**
 * Static helpers for session management
 */
sessionSchema.statics.getSession = async function (facebookId) {
  return await this.findOne({ facebookId });
};

sessionSchema.statics.createSession = async function (facebookId, state = 'INIT') {
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const sess = new this({ facebookId, state, expiresAt });
  await sess.save();
  return sess;
};

sessionSchema.statics.updateState = async function (facebookId, state) {
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const session = await this.findOneAndUpdate(
    { facebookId },
    { $set: { state, updatedAt: new Date(), expiresAt } },
    { new: true, upsert: true }
  );
  return session;
};

sessionSchema.statics.updateData = async function (facebookId, data = {}) {
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const existing = await this.findOne({ facebookId });
  const merged = Object.assign({}, existing?.tempData || {}, data);

  const session = await this.findOneAndUpdate(
    { facebookId },
    { $set: { tempData: merged, updatedAt: new Date(), expiresAt } },
    { new: true, upsert: true }
  );

  return session;
};

module.exports = mongoose.model('Session', sessionSchema);
