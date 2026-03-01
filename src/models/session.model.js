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
    // SELECT_CATEGORY - เลือกประเภท
    // SELECT_SERVICE - เลือกบริการ
    // ASK_CUSTOM_SERVICE - ปรับปรุงบริการเอง
    // ASK_BUDGET - ใส่งบประมาณ
    // ASK_URGENT - เลือกความเร่งด่วน
    // ASK_DETAIL - ใส่รายละเอียด
    // COMPLETED - เสร็จสิ้น
    state: {
      type: String,
      enum: ['INIT', 'SELECT_CATEGORY', 'SELECT_SERVICE', 'ASK_CUSTOM_SERVICE', 'ASK_BUDGET', 'ASK_URGENT', 'ASK_DETAIL', 'COMPLETED'],
      default: 'INIT',
    },

    // ข้อมูลชั่วคราว
    tempData: {
      type: {
        type: String, // 'student' | 'real'
        service: String, // 'เว็บไซต์', 'โปรแกรม', etc.
        budget: Number, // งบประมาณ
        urgent: String, // '3 วัน', '7 วัน', '14 วัน'
        detail: String, // รายละเอียด
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
