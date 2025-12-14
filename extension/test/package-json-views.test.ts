import { describe, expect, it } from "vitest";
import packageJson from "../package.json";

describe("package.json views configuration", () => {
  describe("orchestra-explorer views array", () => {
    const views = packageJson.contributes?.views?.["orchestra-explorer"] || [];

    it("should have exactly 3 views registered", () => {
      expect(views).toHaveLength(3);
    });

    it("should have views in correct order: currentTask, sprintExplorer, workflowControls", () => {
      expect(views[0].id).toBe("orchestra.currentTask");
      expect(views[1].id).toBe("orchestra.sprintExplorer");
      expect(views[2].id).toBe("orchestra.workflowControls");
    });

    describe("orchestra.currentTask view", () => {
      const currentTaskView = views.find(
        (v: any) => v.id === "orchestra.currentTask"
      );

      it("should be registered", () => {
        expect(currentTaskView).toBeDefined();
      });

      it("should be a webview type", () => {
        expect(currentTaskView?.type).toBe("webview");
      });

      it("should have a name", () => {
        expect(currentTaskView?.name).toBeDefined();
        expect(typeof currentTaskView?.name).toBe("string");
      });
    });

    describe("orchestra.sprintExplorer view", () => {
      const sprintExplorerView = views.find(
        (v: any) => v.id === "orchestra.sprintExplorer"
      );

      it("should be registered", () => {
        expect(sprintExplorerView).toBeDefined();
      });

      it("should be a tree type", () => {
        expect(sprintExplorerView?.type).toBe("tree");
      });

      it("should have a name", () => {
        expect(sprintExplorerView?.name).toBeDefined();
        expect(typeof sprintExplorerView?.name).toBe("string");
      });
    });

    describe("orchestra.workflowControls view", () => {
      const workflowControlsView = views.find(
        (v: any) => v.id === "orchestra.workflowControls"
      );

      it("should be registered", () => {
        expect(workflowControlsView).toBeDefined();
      });

      it("should be a webview type", () => {
        expect(workflowControlsView?.type).toBe("webview");
      });

      it("should have initialVisibility set to collapsed", () => {
        expect(workflowControlsView?.visibility).toBe("collapsed");
      });

      it("should have a name", () => {
        expect(workflowControlsView?.name).toBeDefined();
        expect(typeof workflowControlsView?.name).toBe("string");
      });
    });

    it("should not have the old orchestraSprintExplorer view ID", () => {
      const oldView = views.find(
        (v: any) => v.id === "orchestraSprintExplorer"
      );
      expect(oldView).toBeUndefined();
    });
  });

  describe("view/title menu configuration", () => {
    const viewTitleMenus = packageJson.contributes?.menus?.["view/title"] || [];

    it("should have view/title menu items", () => {
      expect(viewTitleMenus.length).toBeGreaterThan(0);
    });

    it("should have refresh button in Sprint Explorer", () => {
      const refreshButton = viewTitleMenus.find(
        (menu: any) => menu.command === "orchestra.refreshStatus"
      );
      expect(refreshButton).toBeDefined();
      expect(refreshButton?.when).toBe("view == orchestra.sprintExplorer");
      expect(refreshButton?.group).toBe("navigation");
    });

    it("should have settings button in Sprint Explorer", () => {
      const settingsButton = viewTitleMenus.find(
        (menu: any) => menu.command === "orchestra.openSprintSettings"
      );
      expect(settingsButton).toBeDefined();
      expect(settingsButton?.when).toBe("view == orchestra.sprintExplorer");
      expect(settingsButton?.group).toBe("navigation");
    });

    it("should use correct view ID (orchestra.sprintExplorer) in when clauses", () => {
      const allButtonsUseCorrectId = viewTitleMenus.every(
        (menu: any) =>
          !menu.when || menu.when.includes("orchestra.sprintExplorer")
      );
      expect(allButtonsUseCorrectId).toBe(true);
    });

    it("should not use old camelCase view ID (orchestraSprintExplorer)", () => {
      const anyButtonUsesOldId = viewTitleMenus.some(
        (menu: any) => menu.when?.includes("orchestraSprintExplorer")
      );
      expect(anyButtonUsesOldId).toBe(false);
    });
  });
});
