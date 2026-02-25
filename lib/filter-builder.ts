/**
 * @file filter-builder.ts
 * @description Builds filter expressions for memsearch CLI (Task 18).
 *              Supports filtering by tags, technology, and source_session metadata fields.
 *              Generates Milvus-compatible filter expressions with type-safe field names.
 */

import type { MemsearchYamlConfig } from "./config-yaml.js";

/**
 * Error codes for filter builder operations
 */
export type FilterBuilderErrorCode =
  | "invalid_field"
  | "invalid_operator"
  | "invalid_value"
  | "empty_condition"
  | "config_error";

/**
 * Custom error class for filter builder operations
 */
export class FilterBuilderError extends Error {
  readonly code: FilterBuilderErrorCode;
  readonly retryable: boolean;

  constructor(
    code: FilterBuilderErrorCode,
    message: string,
    options?: {
      retryable?: boolean;
      cause?: unknown;
    },
  ) {
    super(message, { cause: options?.cause });
    this.name = "FilterBuilderError";
    this.code = code;
    this.retryable = options?.retryable ?? false;
  }
}

/**
 * Supported metadata fields for filtering
 */
export type FilterField = "tags" | "technology" | "source_session";

/**
 * Supported comparison operators
 */
export type ComparisonOperator = "eq" | "ne" | "gt" | "gte" | "lt" | "lte";

/**
 * Supported array operators
 */
export type ArrayOperator = "in" | "contains";

/**
 * All supported operators
 */
export type FilterOperator = ComparisonOperator | ArrayOperator;

/**
 * A single filter condition
 */
export interface FilterCondition {
  field: FilterField;
  operator: FilterOperator;
  value: string | number | boolean | string[];
}

/**
 * Result type for filter building - discriminated union
 */
export type FilterResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: FilterBuilderError };

/**
 * Built filter expression ready for CLI use
 */
export interface FilterExpression {
  /** The filter expression string for Milvus */
  expression: string;
  /** Parameter values for the expression (if any) */
  params: Record<string, string | number | boolean | string[]>;
}

/**
 * Configuration for FilterBuilder
 */
export interface FilterBuilderConfig {
  /** Default field values to use when not specified */
  defaults?: Partial<Record<FilterField, string>>;
  /** Whether to enable strict field validation */
  strict?: boolean;
}

/**
 * FilterBuilder provides a fluent API for building Milvus-compatible filter expressions.
 * Supports filtering by tags, technology, and source_session metadata fields.
 *
 * @example
 * ```typescript
 * const builder = FilterBuilder.create();
 *
 * // Simple equality filter
 * const filter1 = builder.eq("technology", "typescript").build();
 * // expression: 'technology == "typescript"'
 *
 * // Array contains filter
 * const filter2 = builder.contains("tags", "react").build();
 * // expression: 'tags @> "react"'
 *
 * // Combined with AND
 * const filter3 = builder
 *   .eq("technology", "typescript")
 *   .and(builder.eq("source_session", "ses_123"))
 *   .build();
 * // expression: 'technology == "typescript" and source_session == "ses_123"'
 * ```
 */
export class FilterBuilder {
  private conditions: FilterCondition[] = [];
  private readonly strict: boolean;
  private readonly defaults: Partial<Record<FilterField, string>>;

  /**
   * Private constructor - use factory methods to create instances
   */
  private constructor(config: FilterBuilderConfig = {}) {
    this.strict = config.strict ?? true;
    this.defaults = config.defaults ?? {};
  }

  /**
   * Create a new FilterBuilder instance
   */
  static create(config?: FilterBuilderConfig): FilterBuilder {
    return new FilterBuilder(config);
  }

  /**
   * Factory method to create a FilterBuilder from MemsearchYamlConfig
   * @param config MemsearchYamlConfig from config-yaml.ts
   * @returns Configured FilterBuilder instance
   */
  static fromConfig(config: MemsearchYamlConfig): FilterBuilder {
    const filterConfig: FilterBuilderConfig = {
      strict: true,
      defaults: {},
    };
    return FilterBuilder.create(filterConfig);
  }

  /**
   * Validate a field name
   */
  private validateField(field: string): FilterField {
    const validFields: FilterField[] = ["tags", "technology", "source_session"];
    if (!validFields.includes(field as FilterField)) {
      throw new FilterBuilderError(
        "invalid_field",
        `Invalid filter field: "${field}". Supported fields: ${validFields.join(", ")}`,
        { retryable: false },
      );
    }
    return field as FilterField;
  }

  /**
   * Validate an operator
   */
  private validateOperator(operator: string): FilterOperator {
    const validOperators: FilterOperator[] = ["eq", "ne", "gt", "gte", "lt", "lte", "in", "contains"];
    if (!validOperators.includes(operator as FilterOperator)) {
      throw new FilterBuilderError(
        "invalid_operator",
        `Invalid filter operator: "${operator}". Supported operators: ${validOperators.join(", ")}`,
        { retryable: false },
      );
    }
    return operator as FilterOperator;
  }

  /**
   * Add a condition to the builder
   */
  private addCondition(condition: FilterCondition): this {
    this.conditions.push(condition);
    return this;
  }

  /**
   * Equal comparison: field == value
   * @param field The field to compare
   * @param value The value to compare against
   */
  eq(field: string, value: string | number | boolean): this {
    const validatedField = this.validateField(field);
    this.validateOperator("eq");

    if (value === undefined || value === null) {
      throw new FilterBuilderError(
        "invalid_value",
        "Value cannot be undefined or null for equality comparison",
        { retryable: false },
      );
    }

    return this.addCondition({
      field: validatedField,
      operator: "eq",
      value,
    });
  }

  /**
   * Not equal comparison: field != value
   * @param field The field to compare
   * @param value The value to compare against
   */
  ne(field: string, value: string | number | boolean): this {
    const validatedField = this.validateField(field);
    this.validateOperator("ne");

    if (value === undefined || value === null) {
      throw new FilterBuilderError(
        "invalid_value",
        "Value cannot be undefined or null for inequality comparison",
        { retryable: false },
      );
    }

    return this.addCondition({
      field: validatedField,
      operator: "ne",
      value,
    });
  }

  /**
   * Greater than: field > value (for numeric fields)
   * @param field The field to compare
   * @param value The value to compare against
   */
  gt(field: string, value: number): this {
    const validatedField = this.validateField(field);
    this.validateOperator("gt");

    return this.addCondition({
      field: validatedField,
      operator: "gt",
      value,
    });
  }

  /**
   * Greater than or equal: field >= value
   * @param field The field to compare
   * @param value The value to compare against
   */
  gte(field: string, value: number): this {
    const validatedField = this.validateField(field);
    this.validateOperator("gte");

    return this.addCondition({
      field: validatedField,
      operator: "gte",
      value,
    });
  }

  /**
   * Less than: field < value
   * @param field The field to compare
   * @param value The value to compare against
   */
  lt(field: string, value: number): this {
    const validatedField = this.validateField(field);
    this.validateOperator("lt");

    return this.addCondition({
      field: validatedField,
      operator: "lt",
      value,
    });
  }

  /**
   * Less than or equal: field <= value
   * @param field The field to compare
   * @param value The value to compare against
   */
  lte(field: string, value: number): this {
    const validatedField = this.validateField(field);
    this.validateOperator("lte");

    return this.addCondition({
      field: validatedField,
      operator: "lte",
      value,
    });
  }

  /**
   * In array: field in [value1, value2, ...]
   * @param field The field to check
   * @param values Array of values to match against
   */
  in(field: string, values: string[]): this {
    const validatedField = this.validateField(field);
    this.validateOperator("in");

    if (!values || values.length === 0) {
      throw new FilterBuilderError(
        "invalid_value",
        "Value array cannot be empty for 'in' operator",
        { retryable: false },
      );
    }

    return this.addCondition({
      field: validatedField,
      operator: "in",
      value: values,
    });
  }

  /**
   * Array contains: field @> value (array contains element)
   * @param field The array field to check
   * @param value The value that should be contained
   */
  contains(field: string, value: string): this {
    const validatedField = this.validateField(field);
    this.validateOperator("contains");

    if (!value || value.trim() === "") {
      throw new FilterBuilderError(
        "invalid_value",
        "Value cannot be empty for 'contains' operator",
        { retryable: false },
      );
    }

    return this.addCondition({
      field: validatedField,
      operator: "contains",
      value,
    });
  }

  /**
   * Logical AND: combine this builder with another filter expression
   * @param other Another FilterBuilder or FilterExpression to combine
   */
  and(other: FilterBuilder | FilterExpression): this {
    if (other instanceof FilterBuilder) {
      const expr = other.build();
      if (expr.expression) {
        const otherConditions = FilterBuilder.parseExpression(expr.expression);
        this.conditions.push(...otherConditions);
      }
    } else if (other.expression) {
      const otherConditions = FilterBuilder.parseExpression(other.expression);
      this.conditions.push(...otherConditions);
    }
    return this;
  }

  /**
   * Logical OR: create an OR expression
   * Note: For OR, you should use the static or() method
   * @deprecated Use FilterBuilder.or() for OR conditions
   */
  or(_other: FilterBuilder | FilterExpression): this {
    throw new FilterBuilderError(
      "invalid_operator",
      "Use FilterBuilder.or() static method for OR conditions",
      { retryable: false },
    );
  }

  /**
   * Static method to create an OR expression between multiple filters
   * @param builders Array of FilterBuilder instances
   * @returns A new FilterBuilder with OR conditions
   */
  static or(...builders: FilterBuilder[]): FilterBuilder {
    const combined = FilterBuilder.create();
    const expressions = builders.map((b) => b.build().expression).filter((e) => e);
    if (expressions.length > 0) {
      // For OR expressions, we store them as a special condition that will be
      // rendered with parentheses and OR logic in the build() method
      combined.conditions.push({
        field: "_or" as FilterField,
        operator: "in",
        value: expressions,
      });
    }
    return combined;
  }

  /**
   * Parse an expression string back to conditions (for combining)
   */
  private static parseExpression(expression: string): FilterCondition[] {
    // Simple parsing for combining conditions
    // This is a basic implementation - more complex expressions may need better parsing
    const conditions: FilterCondition[] = [];
    const parts = expression.split(/\s+and\s+/i);

    for (const part of parts) {
      const match = part.match(/(\w+)\s*(==|!=|>=|<=|>|<|@>)\s*"([^"]+)"/);
      if (match) {
        const [, field, op, value] = match;
        let operator: FilterOperator = "eq";

        switch (op) {
          case "==":
            operator = "eq";
            break;
          case "!=":
            operator = "ne";
            break;
          case ">":
            operator = "gt";
            break;
          case ">=":
            operator = "gte";
            break;
          case "<":
            operator = "lt";
            break;
          case "<=":
            operator = "lte";
            break;
          case "@>":
            operator = "contains";
            break;
        }

        conditions.push({
          field: field as FilterField,
          operator,
          value,
        });
      }
    }

    return conditions;
  }

  /**
   * Convert a value to Milvus filter string
   */
  private valueToString(value: string | number | boolean | string[]): string {
    if (Array.isArray(value)) {
      return `[${value.map((v) => `"${this.escapeValue(v)}"`).join(", ")}]`;
    }
    if (typeof value === "number") {
      return String(value);
    }
    if (typeof value === "boolean") {
      return String(value);
    }
    return `"${this.escapeValue(value)}"`;
  }

  /**
   * Escape special characters in filter values
   */
  private escapeValue(value: string): string {
    return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  /**
   * Build the filter expression
   * @returns FilterExpression with expression string and params
   */
  build(): FilterExpression {
    if (this.conditions.length === 0) {
      return {
        expression: "",
        params: {},
      };
    }

    // Special handling for OR conditions
    const orConditions = this.conditions.filter((c) => c.field === "_or");
    const regularConditions = this.conditions.filter((c) => c.field !== "_or");

    // Build regular conditions
    const parts: string[] = [];
    const params: Record<string, string | number | boolean | string[]> = {};

    for (const condition of regularConditions) {
      let expr = "";

      switch (condition.operator) {
        case "eq":
          expr = `${condition.field} == ${this.valueToString(condition.value)}`;
          break;
        case "ne":
          expr = `${condition.field} != ${this.valueToString(condition.value)}`;
          break;
        case "gt":
          expr = `${condition.field} > ${condition.value}`;
          break;
        case "gte":
          expr = `${condition.field} >= ${condition.value}`;
          break;
        case "lt":
          expr = `${condition.field} < ${condition.value}`;
          break;
        case "lte":
          expr = `${condition.field} <= ${condition.value}`;
          break;
        case "in":
          expr = `${condition.field} in ${this.valueToString(condition.value as string[])}`;
          break;
        case "contains":
          expr = `${condition.field} @> ${this.valueToString(condition.value)}`;
          break;
      }

      parts.push(expr);
    }

    // Join with AND
    let expression = parts.join(" and ");

    // Handle OR conditions - wrap them in parentheses
    for (const orCond of orConditions) {
      const orExpr = (orCond.value as string[]).join(" or ");
      if (expression) {
        expression = `(${expression}) and (${orExpr})`;
      } else {
        expression = `(${orExpr})`;
      }
    }

    return {
      expression,
      params,
    };
  }

  /**
   * Get current conditions (for testing/debugging)
   */
  getConditions(): FilterCondition[] {
    return [...this.conditions];
  }

  /**
   * Clear all conditions
   */
  clear(): this {
    this.conditions = [];
    return this;
  }

  /**
   * Check if builder has any conditions
   */
  isEmpty(): boolean {
    return this.conditions.length === 0;
  }
}

/**
 * Filter syntax documentation:
 *
 * ## Supported Fields
 * - `tags`: Array of string tags (supports contains, in)
 * - `technology`: Technology or framework name (supports eq, ne, in, contains)
 * - `source_session`: Session ID that created the entry (supports eq, ne, in)
 *
 * ## Supported Operators
 * - `eq`: Equal (==) - field == "value"
 * - `ne`: Not equal (!=) - field != "value"
 * - `gt`: Greater than (>) - field > value (numeric)
 * - `gte`: Greater than or equal (>=) - field >= value (numeric)
 * - `lt`: Less than (<) - field < value (numeric)
 * - `lte`: Less than or equal (<=) - field <= value (numeric)
 * - `in`: In array - field in ["a", "b", "c"]
 * - `contains`: Array contains - field @> "value"
 *
 * ## Logical Operators
 * - `and`: Combine conditions with AND (default when chaining methods)
 * - `FilterBuilder.or()`: Combine conditions with OR
 *
 * ## Examples
 * ```typescript
 * // Single condition
 * FilterBuilder.create().eq("technology", "typescript").build()
 * // { expression: 'technology == "typescript"', params: {} }
 *
 * // Multiple conditions (AND)
 * FilterBuilder.create()
 *   .eq("technology", "typescript")
 *   .contains("tags", "react")
 *   .build()
 * // { expression: 'technology == "typescript" and tags @> "react"', params: {} }
 *
 * // Array operations
 * FilterBuilder.create().in("tags", ["react", "vue", "angular"]).build()
 * // { expression: 'tags in ["react", "vue", "angular"]', params: {} }
 *
 * // OR conditions
 * FilterBuilder.or(
 *   FilterBuilder.create().eq("technology", "typescript"),
 *   FilterBuilder.create().eq("technology", "javascript")
 * ).build()
 * // { expression: '(technology == "typescript" or technology == "javascript")', params: {} }
 * ```
 */

export default FilterBuilder;
