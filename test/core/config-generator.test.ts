/**
 * Tests for config-generator module
 *
 * TD-003: Template-Based Config Generation
 */

import { describe, expect, it } from "vitest";
import {
  ConfigTemplateContext,
  createDefaultContext,
  generateAllConfigs,
  generateManifestYaml,
  generateOrchestraYaml,
  generateProgressYaml,
  getPackageTemplatesDir,
} from "../../src/core/config-generator.js";

describe("config-generator", () => {
  describe("getPackageTemplatesDir", () => {
    it("should return the package templates directory", () => {
      const templatesDir = getPackageTemplatesDir();
      expect(templatesDir).toBeDefined();
      expect(templatesDir).toContain("templates");
    });
  });

  describe("createDefaultContext", () => {
    it("should create context with default values", () => {
      const context = createDefaultContext();

      expect(context.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(context.version).toBe("1.0.0");
      expect(context.sprint.id).toBe("sprint-001");
      expect(context.sprint.name).toBe("Sprint Name");
      expect(context.sprint.status).toBe("ACTIVE");
      expect(context.paths.manifest).toBe("manifest.yaml");
      expect(context.paths.handovers).toBe("handover");
      expect(context.git.auto_commit).toBe(false);
      expect(context.git.commit_prefix).toBe("orchestra");
    });

    it("should include speckit when provided", () => {
      const context = createDefaultContext("spec/my-spec");

      expect(context.speckit).toBeDefined();
      expect(context.speckit?.root).toBe("spec/my-spec");
      expect(context.speckit?.tasks_file).toBe("spec/my-spec/tasks.md");
    });

    it("should not include speckit when not provided", () => {
      const context = createDefaultContext();

      expect(context.speckit).toBeUndefined();
    });
  });

  describe("generateManifestYaml", () => {
    it("should generate valid manifest YAML without specPath", () => {
      const context = createDefaultContext();
      const manifest = generateManifestYaml(context);

      expect(manifest).toContain("# Orchestra Manifest");
      expect(manifest).toContain('version: "1.0.0"');
      expect(manifest).toContain("sprint:");
      expect(manifest).toContain('id: "sprint-001"');
      expect(manifest).toContain("phases:");
      expect(manifest).toContain("# TODO: Add speckit.root to orchestra.yaml");
    });

    it("should include speckit reference when provided", () => {
      const context = createDefaultContext("spec/requirements");
      const manifest = generateManifestYaml(context);

      // Manifest template should reference speckit from orchestra.yaml
      expect(manifest).toContain("speckit_task_ref:");
    });

    it("should include today's date", () => {
      const context = createDefaultContext();
      const manifest = generateManifestYaml(context);

      expect(manifest).toContain(context.today);
    });

    it("should include task structure", () => {
      const context = createDefaultContext();
      const manifest = generateManifestYaml(context);

      expect(manifest).toContain("task_id: 1");
      expect(manifest).toContain("task_id: 2");
      expect(manifest).toContain("status: PENDING");
      expect(manifest).toContain("dependencies: []");
      expect(manifest).toContain("dependencies: [1]");
    });
  });

  describe("generateOrchestraYaml", () => {
    it("should generate valid orchestra config YAML", () => {
      const context = createDefaultContext();
      const config = generateOrchestraYaml(context);

      expect(config).toContain("# Orchestra Configuration");
      expect(config).toContain('version: "1.0.0"');
      expect(config).toContain("paths:");
      expect(config).toContain("manifest: manifest.yaml");
      expect(config).toContain("git:");
      expect(config).toContain("auto_commit: false");
      expect(config).toContain('commit_prefix: "orchestra"');
    });

    it("should include speckit section when specPath provided", () => {
      const context = createDefaultContext("spec/my-spec.md");
      const config = generateOrchestraYaml(context);

      expect(config).toContain("speckit:");
      expect(config).toContain('root: "spec/my-spec.md"');
    });

    it("should not include speckit section when specPath not provided", () => {
      const context = createDefaultContext();
      const config = generateOrchestraYaml(context);

      expect(config).not.toContain("speckit:");
      expect(config).not.toContain("root:");
    });
  });

  describe("generateProgressYaml", () => {
    it("should generate valid progress YAML", () => {
      const context = createDefaultContext();
      const progress = generateProgressYaml(context);

      expect(progress).toContain("# Orchestra Progress Tracker");
      expect(progress).toContain('sprint_id: "sprint-001"');
      expect(progress).toContain("entries: []");
    });

    it("should include today's date", () => {
      const context = createDefaultContext();
      const progress = generateProgressYaml(context);

      expect(progress).toContain(`created_at: "${context.today}"`);
    });
  });

  describe("generateAllConfigs", () => {
    it("should generate all three config files", () => {
      const configs = generateAllConfigs();

      expect(configs.manifest).toContain("# Orchestra Manifest");
      expect(configs.orchestra).toContain("# Orchestra Configuration");
      expect(configs.progress).toContain("# Orchestra Progress Tracker");
    });

    it("should pass speckit config to orchestra.yaml", () => {
      const configs = generateAllConfigs("my/spec/path");

      expect(configs.orchestra).toContain('root: "my/spec/path"');
      expect(configs.orchestra).toContain(
        'tasks_file: "my/spec/path/tasks.md"'
      );
    });
  });

  describe("custom context", () => {
    it("should render with custom context values", () => {
      const context: ConfigTemplateContext = {
        today: "2025-12-06",
        version: "2.0.0",
        speckit: {
          root: "custom/spec",
          tasks_file: "custom/spec/tasks.md",
        },
        sprint: {
          id: "sprint-custom",
          name: "Custom Sprint",
          status: "ACTIVE",
        },
        paths: {
          manifest: "custom-manifest.yaml",
          handovers: "custom-handover",
          feedback: "custom-feedback",
          artifacts: "custom-artifacts",
          templates: "custom-templates",
        },
        git: {
          auto_stage: true,
          auto_commit: true,
          commit_prefix: "feat",
        },
      };

      const manifest = generateManifestYaml(context);
      expect(manifest).toContain('id: "sprint-custom"');
      expect(manifest).toContain('name: "Custom Sprint"');
      expect(manifest).toContain("Generated 2025-12-06");

      const orchestra = generateOrchestraYaml(context);
      expect(orchestra).toContain('version: "2.0.0"');
      expect(orchestra).toContain("manifest: custom-manifest.yaml");
      expect(orchestra).toContain("auto_commit: true");
      expect(orchestra).toContain('commit_prefix: "feat"');
      expect(orchestra).toContain('root: "custom/spec"');
      expect(orchestra).toContain('tasks_file: "custom/spec/tasks.md"');

      const progress = generateProgressYaml(context);
      expect(progress).toContain('sprint_id: "sprint-custom"');
    });
  });
});
