import { describe, expect, it } from "bun:test";
import FilterBuilder, {
  FilterBuilderError,
  type FilterExpression,
  type FilterField,
  type FilterOperator,
} from "./filter-builder";

describe("FilterBuilder", () => {
  describe("create", () => {
    it("should create a new FilterBuilder instance", () => {
      const builder = FilterBuilder.create();
      expect(builder).toBeDefined();
      expect(builder.isEmpty()).toBe(true);
    });

    it("should accept config options", () => {
      const builder = FilterBuilder.create({ strict: false });
      expect(builder).toBeDefined();
    });
  });

  describe("fromConfig", () => {
    it("should create FilterBuilder from MemsearchYamlConfig", () => {
      const config = {
        version: 1,
        memoryTypes: [],
      };
      const builder = FilterBuilder.fromConfig(config as any);
      expect(builder).toBeDefined();
      expect(builder.isEmpty()).toBe(true);
    });
  });

  describe("eq", () => {
    it("should create equality filter for technology field", () => {
      const result = FilterBuilder.create().eq("technology", "typescript").build();
      expect(result.expression).toBe('technology == "typescript"');
    });

    it("should create equality filter for source_session field", () => {
      const result = FilterBuilder.create().eq("source_session", "ses_123").build();
      expect(result.expression).toBe('source_session == "ses_123"');
    });

    it("should create equality filter for tags field", () => {
      const result = FilterBuilder.create().eq("tags", "react").build();
      expect(result.expression).toBe('tags == "react"');
    });

    it("should support method chaining", () => {
      const result = FilterBuilder.create()
        .eq("technology", "typescript")
        .eq("source_session", "ses_123")
        .build();
      expect(result.expression).toBe(
        'technology == "typescript" and source_session == "ses_123"',
      );
    });

    it("should handle numeric values", () => {
      const result = FilterBuilder.create().eq("tags", "42").build();
      expect(result.expression).toBe('tags == "42"');
    });

    it("should handle boolean values", () => {
      const result = FilterBuilder.create().eq("tags", "true").build();
      expect(result.expression).toBe('tags == "true"');
    });
  });

  describe("ne", () => {
    it("should create not-equal filter", () => {
      const result = FilterBuilder.create().ne("technology", "java").build();
      expect(result.expression).toBe('technology != "java"');
    });

    it("should chain multiple ne conditions with AND", () => {
      const result = FilterBuilder.create()
        .ne("technology", "java")
        .ne("source_session", "ses_old")
        .build();
      expect(result.expression).toBe(
        'technology != "java" and source_session != "ses_old"',
      );
    });
  });

  describe("gt, gte, lt, lte", () => {
    it("should create greater than filter", () => {
      const result = FilterBuilder.create().gt("source_session", 5 as any).build();
      expect(result.expression).toBe("source_session > 5");
    });

    it("should create greater than or equal filter", () => {
      const result = FilterBuilder.create().gte("source_session", 5 as any).build();
      expect(result.expression).toBe("source_session >= 5");
    });

    it("should create less than filter", () => {
      const result = FilterBuilder.create().lt("source_session", 5 as any).build();
      expect(result.expression).toBe("source_session < 5");
    });

    it("should create less than or equal filter", () => {
      const result = FilterBuilder.create().lte("source_session", 5 as any).build();
      expect(result.expression).toBe("source_session <= 5");
    });

    it("should chain multiple comparison operators", () => {
      const result = FilterBuilder.create()
        .gte("source_session", 3 as any)
        .lte("source_session", 7 as any)
        .build();
      expect(result.expression).toBe("source_session >= 3 and source_session <= 7");
    });
  });

  describe("in", () => {
    it("should create in-array filter", () => {
      const result = FilterBuilder.create()
        .in("technology", ["typescript", "javascript", "python"])
        .build();
      expect(result.expression).toBe(
        'technology in ["typescript", "javascript", "python"]',
      );
    });

    it("should create in-array filter for tags", () => {
      const result = FilterBuilder.create()
        .in("tags", ["react", "vue", "angular"])
        .build();
      expect(result.expression).toBe('tags in ["react", "vue", "angular"]');
    });

    it("should create in-array filter for source_session", () => {
      const result = FilterBuilder.create()
        .in("source_session", ["ses_1", "ses_2", "ses_3"])
        .build();
      expect(result.expression).toBe('source_session in ["ses_1", "ses_2", "ses_3"]');
    });

    it("should throw on empty array", () => {
      expect(() => FilterBuilder.create().in("technology", [])).toThrow();
    });
  });

  describe("contains", () => {
    it("should create array contains filter", () => {
      const result = FilterBuilder.create().contains("tags", "react").build();
      expect(result.expression).toBe('tags @> "react"');
    });

    it("should create contains filter for technology", () => {
      const result = FilterBuilder.create().contains("technology", "node").build();
      expect(result.expression).toBe('technology @> "node"');
    });

    it("should throw on empty value", () => {
      expect(() => FilterBuilder.create().contains("tags", "")).toThrow();
    });

    it("should throw on whitespace-only value", () => {
      expect(() => FilterBuilder.create().contains("tags", "   ")).toThrow();
    });
  });

  describe("and", () => {
    it("should combine filters with AND using method chaining", () => {
      const result = FilterBuilder.create()
        .eq("technology", "typescript")
        .contains("tags", "react")
        .build();
      expect(result.expression).toBe(
        'technology == "typescript" and tags @> "react"',
      );
    });

    it("should combine using and() method with FilterBuilder", () => {
      const other = FilterBuilder.create().eq("source_session", "ses_123");
      const result = FilterBuilder.create()
        .eq("technology", "typescript")
        .and(other)
        .build();
      expect(result.expression).toBe(
        'technology == "typescript" and source_session == "ses_123"',
      );
    });

    it("should combine using and() method with FilterExpression", () => {
      const expr: FilterExpression = {
        expression: 'source_session == "ses_123"',
        params: {},
      };
      const result = FilterBuilder.create()
        .eq("technology", "typescript")
        .and(expr)
        .build();
      expect(result.expression).toBe(
        'technology == "typescript" and source_session == "ses_123"',
      );
    });
  });

  describe("or", () => {
    it("should create OR expression using static or() method", () => {
      const result = FilterBuilder.or(
        FilterBuilder.create().eq("technology", "typescript"),
        FilterBuilder.create().eq("technology", "javascript"),
      ).build();
      expect(result.expression).toBe(
        '(technology == "typescript" or technology == "javascript")',
      );
    });

    it("should combine OR with AND", () => {
      const base = FilterBuilder.create().contains("tags", "react");
      const result = FilterBuilder.or(
        FilterBuilder.create().eq("technology", "typescript"),
        FilterBuilder.create().eq("technology", "javascript"),
      )
        .and(base)
        .build();
      // The order is: AND conditions first, then OR in parentheses
      expect(result.expression).toBe(
        '(tags @> "react") and (technology == "typescript" or technology == "javascript")',
      );
    });
  });

  describe("build", () => {
    it("should return empty expression when no conditions", () => {
      const result = FilterBuilder.create().build();
      expect(result.expression).toBe("");
      expect(result.params).toEqual({});
    });

    it("should return params object", () => {
      const result = FilterBuilder.create().eq("technology", "typescript").build();
      expect(result.params).toBeDefined();
      expect(typeof result.params).toBe("object");
    });
  });

  describe("clear", () => {
    it("should clear all conditions", () => {
      const builder = FilterBuilder.create()
        .eq("technology", "typescript")
        .eq("source_session", "ses_123");
      expect(builder.isEmpty()).toBe(false);
      builder.clear();
      expect(builder.isEmpty()).toBe(true);
    });

    it("should return empty expression after clear", () => {
      const builder = FilterBuilder.create().eq("technology", "typescript");
      builder.clear();
      expect(builder.build().expression).toBe("");
    });
  });

  describe("getConditions", () => {
    it("should return copy of conditions", () => {
      const builder = FilterBuilder.create().eq("technology", "typescript");
      const conditions = builder.getConditions();
      expect(conditions.length).toBe(1);
      expect(conditions[0].field).toBe("technology");
      expect(conditions[0].operator).toBe("eq");
      expect(conditions[0].value).toBe("typescript");
    });
  });

  describe("isEmpty", () => {
    it("should return true for empty builder", () => {
      expect(FilterBuilder.create().isEmpty()).toBe(true);
    });

    it("should return false for builder with conditions", () => {
      expect(FilterBuilder.create().eq("technology", "typescript").isEmpty()).toBe(
        false,
      );
    });
  });

  describe("error handling", () => {
    it("should throw on invalid field", () => {
      expect(() => FilterBuilder.create().eq("invalid_field", "value")).toThrow(
        FilterBuilderError,
      );
    });

    it("should throw on invalid operator", () => {
      // This is internal validation, but we can test via invalid values
      expect(() =>
        FilterBuilder.create().eq("technology", null as any),
      ).toThrow(FilterBuilderError);
    });

    it("should throw on undefined value for eq", () => {
      expect(() =>
        FilterBuilder.create().eq("technology", undefined as any),
      ).toThrow(FilterBuilderError);
    });

    it("should throw on null value for eq", () => {
      expect(() =>
        FilterBuilder.create().eq("technology", null as any),
      ).toThrow(FilterBuilderError);
    });

    it("FilterBuilderError should have correct code", () => {
      try {
        FilterBuilder.create().eq("invalid", "value");
      } catch (e) {
        expect(e).toBeInstanceOf(FilterBuilderError);
        expect((e as FilterBuilderError).code).toBe("invalid_field");
      }
    });

    it("FilterBuilderError should have retryable property", () => {
      const error = new FilterBuilderError("invalid_field", "test error");
      expect(error.retryable).toBe(false);
    });
  });

  describe("value escaping", () => {
    it("should escape quotes in values", () => {
      const result = FilterBuilder.create()
        .eq("technology", 'test"value')
        .build();
      expect(result.expression).toBe('technology == "test\\"value"');
    });

    it("should escape backslashes in values", () => {
      const result = FilterBuilder.create()
        .eq("technology", "test\\value")
        .build();
      expect(result.expression).toBe("technology == \"test\\\\value\"");
    });
  });

  describe("complex expressions", () => {
    it("should handle complex filter with multiple operators", () => {
      const result = FilterBuilder.create()
        .eq("technology", "typescript")
        .contains("tags", "react")
        .in("source_session", ["ses_1", "ses_2"])
        .ne("tags", "deprecated")
        .build();
      expect(result.expression).toBe(
        'technology == "typescript" and tags @> "react" and source_session in ["ses_1", "ses_2"] and tags != "deprecated"',
      );
    });

    it("should handle three-way OR expression", () => {
      const result = FilterBuilder.or(
        FilterBuilder.create().eq("technology", "typescript"),
        FilterBuilder.create().eq("technology", "javascript"),
        FilterBuilder.create().eq("technology", "python"),
      ).build();
      expect(result.expression).toBe(
        '(technology == "typescript" or technology == "javascript" or technology == "python")',
      );
    });
  });

  describe("type exports", () => {
    it("should export FilterField type", () => {
      const field: FilterField = "tags";
      expect(field).toBe("tags");
    });

    it("should export FilterOperator type", () => {
      const op: FilterOperator = "eq";
      expect(op).toBe("eq");
    });
  });
});
