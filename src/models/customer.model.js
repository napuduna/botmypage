const mongoose = require('mongoose');

/**
 * Customer Schema
 * บันทึกข้อมูลลูกค้า
 */
const customerSchema = new mongoose.Schema(
  {
    // Facebook ID
    facebookId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    // Type: 'student' | 'real' (business)
    type: {
      type: String,
      enum: ['student', 'real'],
      default: null,
    },

    // ข้อมูลผู้ใช้
    name: String,
    email: String,
    phone: String,

    // ข้อมูลเฉพาะ
    detail: {
      // สำหรับนักเรียน
      schoolName: String,
      projectTopic: String,

      // สำหรับธุรกิจ
      businessName: String,
      businessType: String,
      businessDescription: String,
    },

    // LINE User ID (หลังจากส่งข้อมูลหรือ mapping)
    lineUserId: String,

    // สถานะ
    isActive: {
      type: Boolean,
      default: true,
    },

    // ข้อมูล metadata
    metadata: {
      source: String, // facebook / line
      ipAddress: String,
      userAgent: String,
    },

    // Auto-delete after 30 minutes
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

module.exports = mongoose.model('Customer', customerSchema);
