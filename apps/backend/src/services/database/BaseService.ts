import { Model, Document, FilterQuery, UpdateQuery, QueryOptions, PipelineStage } from 'mongoose';
import { 
  PaginationOptions, 
  SortOptions, 
  QueryFilters, 
  PaginatedResponse, 
  ApiResponse 
} from '@maestro/shared/types';
import { DatabaseError, ValidationError, NotFoundError } from '@/utils/errors';
import logger from '@/config/logger';

/**
 * Pagination Result Interface
 */
export interface PaginationResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

/**
 * Base Database Service
 * 
 * Provides common CRUD operations, pagination, and query utilities
 * that can be extended by specific model services.
 */
export abstract class BaseService<TDocument extends Document> {
  protected model: Model<TDocument>;
  protected modelName: string;

  constructor(model: Model<TDocument>) {
    this.model = model;
    this.modelName = model.modelName;
  }

  /**
   * Create a new document
   */
  async create(data: Partial<TDocument>): Promise<TDocument> {
    try {
      const document = new this.model(data);
      const saved = await document.save();
      
      logger.debug(`${this.modelName} created`, { id: saved._id });
      return saved;
    } catch (error) {
      if (error.name === 'ValidationError') {
        throw new ValidationError(`Invalid ${this.modelName} data`, { details: error.errors });
      }
      if (error.code === 11000) {
        throw new ValidationError(`${this.modelName} already exists`, { details: error.keyValue });
      }
      
      logger.error(`Failed to create ${this.modelName}`, { error, data });
      throw new DatabaseError(`Failed to create ${this.modelName}`, { originalError: error });
    }
  }

  /**
   * Find document by ID
   */
  async findById(id: string, projection?: any): Promise<TDocument | null> {
    try {
      const document = await this.model.findById(id, projection);
      return document;
    } catch (error) {
      logger.error(`Failed to find ${this.modelName} by ID`, { id, error });
      throw new DatabaseError(`Failed to find ${this.modelName}`, { originalError: error });
    }
  }

  /**
   * Find document by ID and throw if not found
   */
  async findByIdOrThrow(id: string, projection?: any): Promise<TDocument> {
    const document = await this.findById(id, projection);
    if (!document) {
      throw new NotFoundError(`${this.modelName} not found`);
    }
    return document;
  }

  /**
   * Find one document by filter
   */
  async findOne(
    filter: FilterQuery<TDocument>,
    projection?: any,
    options?: QueryOptions
  ): Promise<TDocument | null> {
    try {
      const document = await this.model.findOne(filter, projection, options);
      return document;
    } catch (error) {
      logger.error(`Failed to find ${this.modelName}`, { filter, error });
      throw new DatabaseError(`Failed to find ${this.modelName}`, { originalError: error });
    }
  }

  /**
   * Find one document by filter and throw if not found
   */
  async findOneOrThrow(
    filter: FilterQuery<TDocument>,
    projection?: any,
    options?: QueryOptions
  ): Promise<TDocument> {
    const document = await this.findOne(filter, projection, options);
    if (!document) {
      throw new NotFoundError(`${this.modelName} not found`);
    }
    return document;
  }

  /**
   * Find multiple documents
   */
  async find(
    filter: FilterQuery<TDocument> = {},
    projection?: any,
    options?: QueryOptions
  ): Promise<TDocument[]> {
    try {
      const documents = await this.model.find(filter, projection, options);
      return documents;
    } catch (error) {
      logger.error(`Failed to find ${this.modelName}s`, { filter, error });
      throw new DatabaseError(`Failed to find ${this.modelName}s`, { originalError: error });
    }
  }

  /**
   * Find documents with pagination
   */
  async findWithPagination(
    filter: FilterQuery<TDocument> = {},
    options: {
      page?: number;
      limit?: number;
      sort?: any;
      projection?: any;
    } = {}
  ): Promise<PaginationResult<TDocument>> {
    try {
      const page = Math.max(1, options.page || 1);
      const limit = Math.max(1, Math.min(100, options.limit || 20));
      const skip = (page - 1) * limit;

      // Get total count and data in parallel
      const [total, data] = await Promise.all([
        this.model.countDocuments(filter),
        this.model
          .find(filter, options.projection)
          .sort(options.sort || { createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .exec(),
      ]);

      const totalPages = Math.ceil(total / limit);

      return {
        data,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      };
    } catch (error) {
      logger.error(`Failed to paginate ${this.modelName}s`, { filter, options, error });
      throw new DatabaseError(`Failed to paginate ${this.modelName}s`, { originalError: error });
    }
  }

  /**
   * Update document by ID
   */
  async updateById(
    id: string,
    update: UpdateQuery<TDocument>,
    options: QueryOptions = {}
  ): Promise<TDocument | null> {
    try {
      const defaultOptions = { new: true, runValidators: true };
      const document = await this.model.findByIdAndUpdate(
        id,
        update,
        { ...defaultOptions, ...options }
      );
      
      if (document) {
        logger.debug(`${this.modelName} updated`, { id });
      }
      
      return document;
    } catch (error) {
      if (error.name === 'ValidationError') {
        throw new ValidationError(`Invalid ${this.modelName} update data`, { details: error.errors });
      }
      
      logger.error(`Failed to update ${this.modelName}`, { id, update, error });
      throw new DatabaseError(`Failed to update ${this.modelName}`, { originalError: error });
    }
  }

  /**
   * Update document by ID and throw if not found
   */
  async updateByIdOrThrow(
    id: string,
    update: UpdateQuery<TDocument>,
    options: QueryOptions = {}
  ): Promise<TDocument> {
    const document = await this.updateById(id, update, options);
    if (!document) {
      throw new NotFoundError(`${this.modelName} not found`);
    }
    return document;
  }

  /**
   * Update one document by filter
   */
  async updateOne(
    filter: FilterQuery<TDocument>,
    update: UpdateQuery<TDocument>,
    options: QueryOptions = {}
  ): Promise<TDocument | null> {
    try {
      const defaultOptions = { new: true, runValidators: true };
      const document = await this.model.findOneAndUpdate(
        filter,
        update,
        { ...defaultOptions, ...options }
      );
      
      return document;
    } catch (error) {
      if (error.name === 'ValidationError') {
        throw new ValidationError(`Invalid ${this.modelName} update data`, { details: error.errors });
      }
      
      logger.error(`Failed to update ${this.modelName}`, { filter, update, error });
      throw new DatabaseError(`Failed to update ${this.modelName}`, { originalError: error });
    }
  }

  /**
   * Update multiple documents
   */
  async updateMany(
    filter: FilterQuery<TDocument>,
    update: UpdateQuery<TDocument>,
    options: QueryOptions = {}
  ): Promise<{ matchedCount: number; modifiedCount: number }> {
    try {
      const result = await this.model.updateMany(filter, update, options);
      
      logger.debug(`${this.modelName}s updated`, { 
        matched: result.matchedCount,
        modified: result.modifiedCount 
      });
      
      return {
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount
      };
    } catch (error) {
      logger.error(`Failed to update ${this.modelName}s`, { filter, update, error });
      throw new DatabaseError(`Failed to update ${this.modelName}s`, { originalError: error });
    }
  }

  /**
   * Delete document by ID
   */
  async deleteById(id: string): Promise<TDocument | null> {
    try {
      const document = await this.model.findByIdAndDelete(id);
      
      if (document) {
        logger.debug(`${this.modelName} deleted`, { id });
      }
      
      return document;
    } catch (error) {
      logger.error(`Failed to delete ${this.modelName}`, { id, error });
      throw new DatabaseError(`Failed to delete ${this.modelName}`, { originalError: error });
    }
  }

  /**
   * Delete document by ID and throw if not found
   */
  async deleteByIdOrThrow(id: string): Promise<TDocument> {
    const document = await this.deleteById(id);
    if (!document) {
      throw new NotFoundError(`${this.modelName} not found`);
    }
    return document;
  }

  /**
   * Delete one document by filter
   */
  async deleteOne(filter: FilterQuery<TDocument>): Promise<TDocument | null> {
    try {
      const document = await this.model.findOneAndDelete(filter);
      return document;
    } catch (error) {
      logger.error(`Failed to delete ${this.modelName}`, { filter, error });
      throw new DatabaseError(`Failed to delete ${this.modelName}`, { originalError: error });
    }
  }

  /**
   * Delete multiple documents
   */
  async deleteMany(filter: FilterQuery<TDocument>): Promise<{ deletedCount: number }> {
    try {
      const result = await this.model.deleteMany(filter);
      
      logger.debug(`${this.modelName}s deleted`, { count: result.deletedCount });
      
      return {
        deletedCount: result.deletedCount
      };
    } catch (error) {
      logger.error(`Failed to delete ${this.modelName}s`, { filter, error });
      throw new DatabaseError(`Failed to delete ${this.modelName}s`, { originalError: error });
    }
  }

  /**
   * Count documents
   */
  async count(filter: FilterQuery<TDocument> = {}): Promise<number> {
    try {
      const count = await this.model.countDocuments(filter);
      return count;
    } catch (error) {
      logger.error(`Failed to count ${this.modelName}s`, { filter, error });
      throw new DatabaseError(`Failed to count ${this.modelName}s`, { originalError: error });
    }
  }

  /**
   * Check if document exists
   */
  async exists(filter: FilterQuery<TDocument>): Promise<boolean> {
    try {
      const document = await this.model.exists(filter);
      return !!document;
    } catch (error) {
      logger.error(`Failed to check ${this.modelName} existence`, { filter, error });
      throw new DatabaseError(`Failed to check ${this.modelName} existence`, { originalError: error });
    }
  }

  /**
   * Aggregation pipeline
   */
  async aggregate<T = any>(pipeline: PipelineStage[]): Promise<T[]> {
    try {
      const result = await this.model.aggregate(pipeline);
      return result;
    } catch (error) {
      logger.error(`Failed to aggregate ${this.modelName}s`, { pipeline, error });
      throw new DatabaseError(`Failed to aggregate ${this.modelName}s`, { originalError: error });
    }
  }

  /**
   * Get distinct values for a field
   */
  async distinct<T = any>(field: string, filter: FilterQuery<TDocument> = {}): Promise<T[]> {
    try {
      const values = await this.model.distinct(field, filter);
      return values;
    } catch (error) {
      logger.error(`Failed to get distinct ${field} for ${this.modelName}s`, { field, filter, error });
      throw new DatabaseError(`Failed to get distinct values`, { originalError: error });
    }
  }

  /**
   * Bulk write operations
   */
  async bulkWrite(operations: any[]): Promise<any> {
    try {
      const result = await this.model.bulkWrite(operations);
      
      logger.debug(`${this.modelName} bulk write completed`, {
        inserted: result.insertedCount,
        modified: result.modifiedCount,
        deleted: result.deletedCount
      });
      
      return result;
    } catch (error) {
      logger.error(`Failed to bulk write ${this.modelName}s`, { operations, error });
      throw new DatabaseError(`Failed to bulk write ${this.modelName}s`, { originalError: error });
    }
  }

  /**
   * Build filter from query parameters
   */
  protected buildFilter(
    baseFilter: FilterQuery<TDocument>,
    queryFilters: QueryFilters
  ): FilterQuery<TDocument> {
    const filter = { ...baseFilter };

    // Handle search
    if (queryFilters.search) {
      // This should be overridden by specific services to implement proper text search
      (filter as any).$text = { $search: queryFilters.search };
    }

    // Handle status filter
    if (queryFilters.status) {
      (filter as any).status = queryFilters.status;
    }

    // Handle type filter
    if (queryFilters.type) {
      (filter as any).type = queryFilters.type;
    }

    // Handle date range
    if (queryFilters.dateFrom || queryFilters.dateTo) {
      (filter as any).createdAt = {};
      if (queryFilters.dateFrom) {
        (filter as any).createdAt.$gte = new Date(queryFilters.dateFrom);
      }
      if (queryFilters.dateTo) {
        (filter as any).createdAt.$lte = new Date(queryFilters.dateTo);
      }
    }

    return filter;
  }

  /**
   * Build sort options from sort parameters
   */
  protected buildSort(sortOptions?: SortOptions): any {
    if (!sortOptions) {
      return { createdAt: -1 };
    }

    return {
      [sortOptions.field]: sortOptions.direction === 'asc' ? 1 : -1
    };
  }

  /**
   * Transform API response
   */
  protected transformToApiResponse<T>(
    data: T,
    message?: string
  ): ApiResponse<T> {
    return {
      success: true,
      data,
      message,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Transform paginated API response
   */
  protected transformToPaginatedResponse<T>(
    result: PaginationResult<T>,
    message?: string
  ): PaginatedResponse<T> {
    return {
      success: true,
      data: result.data,
      pagination: result.pagination,
      message,
      timestamp: new Date().toISOString()
    };
  }
}

export default BaseService;