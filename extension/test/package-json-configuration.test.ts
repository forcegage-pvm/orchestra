import { describe, expect, it } from "vitest";
import packageJson from "../package.json";

describe("package.json configuration settings", () => {
  const properties = packageJson.contributes?.configuration?.properties || {};

  describe("AI Model Configuration", () => {
    describe("orchestra.models.orchestrator", () => {
      const setting = properties["orchestra.models.orchestrator"];

      it("should exist in package.json", () => {
        expect(setting).toBeDefined();
      });

      it("should be of type string", () => {
        expect(setting?.type).toBe("string");
      });

      it("should have default value 'claude-opus-4'", () => {
        expect(setting?.default).toBe("claude-opus-4");
      });

      it("should have a descriptive text", () => {
        expect(setting?.description).toBeDefined();
        expect(typeof setting?.description).toBe("string");
        expect(setting?.description.length).toBeGreaterThan(0);
      });
    });

    describe("orchestra.models.implementor", () => {
      const setting = properties["orchestra.models.implementor"];

      it("should exist in package.json", () => {
        expect(setting).toBeDefined();
      });

      it("should be of type string", () => {
        expect(setting?.type).toBe("string");
      });

      it("should have default value 'claude-sonnet-4'", () => {
        expect(setting?.default).toBe("claude-sonnet-4");
      });

      it("should have a descriptive text", () => {
        expect(setting?.description).toBeDefined();
        expect(typeof setting?.description).toBe("string");
        expect(setting?.description.length).toBeGreaterThan(0);
      });
    });
  });

  describe("Agent Mode Configuration", () => {
    describe("orchestra.agents.orchestrator", () => {
      const setting = properties["orchestra.agents.orchestrator"];

      it("should exist in package.json", () => {
        expect(setting).toBeDefined();
      });

      it("should be of type string", () => {
        expect(setting?.type).toBe("string");
      });

      it("should have default value 'orchestra.orchestrator.agent'", () => {
        expect(setting?.default).toBe("orchestra.orchestrator.agent");
      });

      it("should have a descriptive text", () => {
        expect(setting?.description).toBeDefined();
        expect(typeof setting?.description).toBe("string");
        expect(setting?.description.length).toBeGreaterThan(0);
      });
    });

    describe("orchestra.agents.implementor", () => {
      const setting = properties["orchestra.agents.implementor"];

      it("should exist in package.json", () => {
        expect(setting).toBeDefined();
      });

      it("should be of type string", () => {
        expect(setting?.type).toBe("string");
      });

      it("should have default value 'orchestra.implementor.agent'", () => {
        expect(setting?.default).toBe("orchestra.implementor.agent");
      });

      it("should have a descriptive text", () => {
        expect(setting?.description).toBeDefined();
        expect(typeof setting?.description).toBe("string");
        expect(setting?.description.length).toBeGreaterThan(0);
      });
    });
  });

  describe("All four new settings", () => {
    it("should have all model and agent configuration settings", () => {
      expect(properties["orchestra.models.orchestrator"]).toBeDefined();
      expect(properties["orchestra.models.implementor"]).toBeDefined();
      expect(properties["orchestra.agents.orchestrator"]).toBeDefined();
      expect(properties["orchestra.agents.implementor"]).toBeDefined();
    });

    it("should have settings with proper structure", () => {
      const newSettings = [
        "orchestra.models.orchestrator",
        "orchestra.models.implementor",
        "orchestra.agents.orchestrator",
        "orchestra.agents.implementor",
      ] as const;

      newSettings.forEach((settingKey) => {
        const setting = properties[settingKey];
        expect(setting).toBeDefined();
        expect(setting?.type).toBe("string");
        expect(setting?.default).toBeDefined();
        expect(setting?.description).toBeDefined();
        expect(typeof setting?.description).toBe("string");
      });
    });
  });

  describe("Edge cases and validation", () => {
    it("should have settings with non-empty default values", () => {
      expect(properties["orchestra.models.orchestrator"]?.default).toBeTruthy();
      expect(properties["orchestra.models.implementor"]?.default).toBeTruthy();
      expect(properties["orchestra.agents.orchestrator"]?.default).toBeTruthy();
      expect(properties["orchestra.agents.implementor"]?.default).toBeTruthy();
    });

    it("should have settings with descriptive text longer than 10 characters", () => {
      expect(
        properties["orchestra.models.orchestrator"]?.description.length
      ).toBeGreaterThan(10);
      expect(
        properties["orchestra.models.implementor"]?.description.length
      ).toBeGreaterThan(10);
      expect(
        properties["orchestra.agents.orchestrator"]?.description.length
      ).toBeGreaterThan(10);
      expect(
        properties["orchestra.agents.implementor"]?.description.length
      ).toBeGreaterThan(10);
    });

    it("should follow the orchestra.* naming convention", () => {
      expect(properties["orchestra.models.orchestrator"]).toBeDefined();
      expect(properties["orchestra.models.implementor"]).toBeDefined();
      expect(properties["orchestra.agents.orchestrator"]).toBeDefined();
      expect(properties["orchestra.agents.implementor"]).toBeDefined();
    });
  });
});
