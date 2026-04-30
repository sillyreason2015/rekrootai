/**
 * Shared toJSON transform applied to every schema.
 * - Converts _id (ObjectId) to a plain string
 * - Converts Date timestamps to ISO strings
 * - Removes internal __v field
 */
export const baseSchemaOptions = {
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  toJSON: {
    transform: (_: unknown, ret: Record<string, unknown>) => {
      if (ret._id) ret._id = String(ret._id)
      if (ret.createdAt instanceof Date) ret.createdAt = (ret.createdAt as Date).toISOString()
      if (ret.updatedAt instanceof Date) ret.updatedAt = (ret.updatedAt as Date).toISOString()
      delete ret.__v
      return ret
    },
  },
} as const
