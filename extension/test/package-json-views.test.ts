import { describe, expect, it } from "vitest";
import packageJson from "../package.json";

describe("package.json views configuration", () => {
  describe("orchestra-explorer views array", () => {
    const views = packageJson.contributes?.views?.["orchestra-explorer"] || [];

    it("should have exactly 3 views registered", () => {
      expect(views).toHaveLength(3);
    });

    it("should have views in correct order: currentTask, agentPanel, sprintExplorer", () => {
      expect(views[0].id).toBe("orchestra.currentTask");
      expect(views[1].id).toBe("orchestra.agentPanel");
      expect(views[2].id).toBe("orchestra.sprintExplorer");
    });

    describe("orchestra.currentTask view", () => {
      const currentTaskView = views.find(
        (v: any) => v.id === "orchestra.currentTask",
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
        (v: any) => v.id === "orchestra.sprintExplorer",
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

    describe("orchestra.agentPanel view", () => {
      const agentPanelView = views.find(
        (v: any) => v.id === "orchestra.agentPanel",
      );

      it("should be registered", () => {
        expect(agentPanelView).toBeDefined();
      });

      it("should be a webview type", () => {
        expect(agentPanelView?.type).toBe("webview");
      });

      it("should have a name", () => {
        expect(agentPanelView?.name).toBeDefined();
        expect(typeof agentPanelView?.name).toBe("string");
      });
    });

    it("should not have the old orchestraSprintExplorer view ID", () => {
      const oldView = views.find(
        (v: any) => v.id === "orchestraSprintExplorer",
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
        (menu: any) => menu.command === "orchestra.refreshStatus",
      );
      expect(refreshButton).toBeDefined();
      expect(refreshButton?.when).toBe("view == orchestra.sprintExplorer");
      expect(refreshButton?.group).toBe("navigation");
    });

    it("should have settings button in Sprint Explorer", () => {
      const settingsButton = viewTitleMenus.find(
        (menu: any) => menu.command === "orchestra.openSprintSettings",
      );
      expect(settingsButton).toBeDefined();
      expect(settingsButton?.when).toBe("view == orchestra.sprintExplorer");
      expect(settingsButton?.group).toBe("navigation");
    });

    it("should use correct view IDs (orchestra.sprintExplorer or orchestra.agentPanel) in when clauses", () => {
      const allButtonsUseCorrectId = viewTitleMenus.every(
        (menu: any) =>
          !menu.when ||
          menu.when.includes("orchestra.sprintExplorer") ||
          menu.when.includes("orchestra.agentPanel"),
      );
      expect(allButtonsUseCorrectId).toBe(true);
    });

    it("should not use old camelCase view ID (orchestraSprintExplorer)", () => {
      const anyButtonUsesOldId = viewTitleMenus.some((menu: any) =>
        menu.when?.includes("orchestraSprintExplorer"),
      );
      expect(anyButtonUsesOldId).toBe(false);
    });
  });

  describe("view/item/context inline actions", () => {
    const contextMenus =
      packageJson.contributes?.menus?.["view/item/context"] || [];

    it("should have view/item/context menu items", () => {
      expect(contextMenus.length).toBeGreaterThan(0);
    });

    describe("playTask inline button", () => {
      const playTaskInline = contextMenus.find(
        (menu: any) =>
          menu.command === "orchestra.playTask" &&
          menu.group?.startsWith("inline"),
      );

      it("should exist in inline group", () => {
        expect(playTaskInline).toBeDefined();
      });

      it("should have correct when clause for playable task statuses", () => {
        expect(playTaskInline?.when).toBeDefined();
        expect(playTaskInline?.when).toContain("orchestra.sprintExplorer");
        expect(playTaskInline?.when).toContain("task-");
      });

      it("should exclude completed tasks using regex", () => {
        // Should use regex to exclude completed tasks
        expect(playTaskInline?.when).toMatch(/viewItem\s*=~.*task-.*complete/);
      });

      it("should use correct view ID (orchestra.sprintExplorer)", () => {
        expect(playTaskInline?.when).toContain("orchestra.sprintExplorer");
        expect(playTaskInline?.when).not.toContain("orchestraSprintExplorer");
      });

      it("should be in inline group with ordering", () => {
        expect(playTaskInline?.group).toMatch(/^inline/);
      });

      it("should use proper regex pattern with viewItem =~", () => {
        expect(playTaskInline?.when).toMatch(/viewItem\s*=~\s*\/\^task-/);
      });
    });

    describe("openTaskDetail context menu item", () => {
      const openTaskDetail = contextMenus.find(
        (menu: any) => menu.command === "orchestra.openTaskDetail",
      );

      it("should be registered", () => {
        expect(openTaskDetail).toBeDefined();
      });

      it("should have when clause for task items", () => {
        expect(openTaskDetail?.when).toBeDefined();
        expect(openTaskDetail?.when).toContain("orchestra.sprintExplorer");
        expect(openTaskDetail?.when).toContain("task-");
      });

      it("should use correct view ID (orchestra.sprintExplorer)", () => {
        expect(openTaskDetail?.when).toContain("orchestra.sprintExplorer");
        expect(openTaskDetail?.when).not.toContain("orchestraSprintExplorer");
      });

      it("should be in navigation group", () => {
        expect(openTaskDetail?.group).toBe("navigation");
      });
    });

    it("should not use old view ID (orchestraSprintExplorer) in any menu items", () => {
      const anyMenuUsesOldId = contextMenus.some((menu: any) =>
        menu.when?.includes("orchestraSprintExplorer"),
      );
      expect(anyMenuUsesOldId).toBe(false);
    });

    it("should use correct view ID (orchestra.sprintExplorer) in all menus", () => {
      const menusWithWhen = contextMenus.filter((menu: any) => menu.when);
      const allUseCorrectId = menusWithWhen.every(
        (menu: any) =>
          !menu.when.includes("sprintExplorer") ||
          menu.when.includes("orchestra.sprintExplorer"),
      );
      expect(allUseCorrectId).toBe(true);
    });
  });

  describe("keybindings configuration", () => {
    const keybindings = packageJson.contributes?.keybindings || [];

    it("should have keybindings registered", () => {
      expect(keybindings.length).toBeGreaterThan(0);
    });

    describe("playTask Enter keybinding", () => {
      const playTaskKeybinding = keybindings.find(
        (kb: any) => kb.command === "orchestra.playTask",
      );

      it("should be registered", () => {
        expect(playTaskKeybinding).toBeDefined();
      });

      it("should use Enter key", () => {
        expect(playTaskKeybinding?.key).toBe("enter");
      });

      it("should have when clause for sprint explorer with list focus", () => {
        expect(playTaskKeybinding?.when).toBeDefined();
        expect(playTaskKeybinding?.when).toContain("orchestra.sprintExplorer");
        expect(playTaskKeybinding?.when).toContain("listFocus");
      });

      it("should use correct view ID (orchestra.sprintExplorer)", () => {
        expect(playTaskKeybinding?.when).toContain("orchestra.sprintExplorer");
        expect(playTaskKeybinding?.when).not.toContain(
          "orchestraSprintExplorer",
        );
      });
    });
  });

  describe("commands configuration", () => {
    const commands = packageJson.contributes?.commands || [];

    describe("orchestra.playTask command", () => {
      const playTaskCommand = commands.find(
        (cmd: any) => cmd.command === "orchestra.playTask",
      );

      it("should be registered", () => {
        expect(playTaskCommand).toBeDefined();
      });

      it("should have title 'Play Task'", () => {
        expect(playTaskCommand?.title).toBe("Play Task");
      });

      it("should have play icon", () => {
        expect(playTaskCommand?.icon).toBe("$(play)");
      });
    });
  });

  describe("viewItem regex patterns for status-specific menus", () => {
    const contextMenus =
      packageJson.contributes?.menus?.["view/item/context"] || [];

    describe("task-specific menu items", () => {
      it("should use viewItem pattern for all task context menus", () => {
        const taskMenus = contextMenus.filter(
          (menu: any) =>
            menu.when?.includes("viewItem") && menu.when?.includes("task-"),
        );

        expect(taskMenus.length).toBeGreaterThan(0);

        taskMenus.forEach((menu: any) => {
          // Should have either == or =~ operator for viewItem matching
          expect(menu.when).toMatch(/viewItem\s*(==|=~)/);
          expect(menu.when).toContain("task-");
        });
      });

      it("should have openTaskDetail for all task items using task- prefix regex", () => {
        const openTaskDetail = contextMenus.find(
          (menu: any) => menu.command === "orchestra.openTaskDetail",
        );

        expect(openTaskDetail).toBeDefined();
        expect(openTaskDetail?.when).toContain("viewItem =~");
        expect(openTaskDetail?.when).toContain("/^task-/");
      });

      it("should have deEscalateTask only for escalated status", () => {
        const deEscalateMenus = contextMenus.filter(
          (menu: any) => menu.command === "orchestra.deEscalateTask",
        );

        expect(deEscalateMenus.length).toBeGreaterThan(0);

        deEscalateMenus.forEach((menu: any) => {
          expect(menu.when).toContain("viewItem");
          expect(menu.when).toContain("task-escalated");
        });
      });

      it("should have moveToGateCheck for escalated and verify_failed statuses", () => {
        const moveToGateCheckMenus = contextMenus.filter(
          (menu: any) => menu.command === "orchestra.moveToGateCheck",
        );

        expect(moveToGateCheckMenus.length).toBeGreaterThan(0);

        const statusRestrictedMenu = moveToGateCheckMenus.find(
          (menu: any) =>
            menu.when?.includes("viewItem") && menu.when?.includes("task-"),
        );

        expect(statusRestrictedMenu).toBeDefined();
        expect(statusRestrictedMenu?.when).toContain("viewItem =~");
        // Should match task-escalated or task-verify_failed
        expect(statusRestrictedMenu?.when).toMatch(
          /task-\(escalated\|verify_failed\)/,
        );
      });

      it("should have moveToImplement for escalated and verify_failed statuses", () => {
        const moveToImplementMenus = contextMenus.filter(
          (menu: any) => menu.command === "orchestra.moveToImplement",
        );

        expect(moveToImplementMenus.length).toBeGreaterThan(0);

        const statusRestrictedMenu = moveToImplementMenus.find(
          (menu: any) =>
            menu.when?.includes("viewItem") && menu.when?.includes("task-"),
        );

        expect(statusRestrictedMenu).toBeDefined();
        expect(statusRestrictedMenu?.when).toContain("viewItem =~");
        // Should match task-escalated or task-verify_failed
        expect(statusRestrictedMenu?.when).toMatch(
          /task-\(escalated\|verify_failed\)/,
        );
      });

      it("should have forceComplete only for escalated status", () => {
        const forceCompleteMenus = contextMenus.filter(
          (menu: any) => menu.command === "orchestra.forceComplete",
        );

        expect(forceCompleteMenus.length).toBeGreaterThan(0);

        forceCompleteMenus.forEach((menu: any) => {
          expect(menu.when).toContain("viewItem");
          expect(menu.when).toContain("task-escalated");
        });
      });
    });

    describe("viewItem regex pattern structure", () => {
      it("should use proper regex syntax with =~ operator", () => {
        const taskMenusWithRegex = contextMenus.filter(
          (menu: any) =>
            menu.when?.includes("viewItem") &&
            menu.when?.includes("=~") &&
            menu.when?.includes("task-"),
        );

        expect(taskMenusWithRegex.length).toBeGreaterThan(0);

        taskMenusWithRegex.forEach((menu: any) => {
          // Should have format: viewItem =~ /pattern/
          expect(menu.when).toMatch(/viewItem\s*=~\s*\/[^/]+\//);
        });
      });

      it("should anchor task- patterns at the start with ^", () => {
        const taskMenusWithRegex = contextMenus.filter(
          (menu: any) =>
            menu.when?.includes("viewItem =~") && menu.when?.includes("task-"),
        );

        taskMenusWithRegex.forEach((menu: any) => {
          // Patterns should start with ^ to anchor at the beginning
          expect(menu.when).toMatch(/viewItem\s*=~\s*\/\^task-/);
        });
      });

      it("should use proper alternation syntax for multiple statuses", () => {
        const multiStatusMenus = contextMenus.filter(
          (menu: any) =>
            menu.when?.includes("viewItem =~") && menu.when?.includes("|"),
        );

        multiStatusMenus.forEach((menu: any) => {
          // Should have format like (status1|status2)
          expect(menu.when).toMatch(/\([^)]+\|[^)]+\)/);
        });
      });
    });

    describe("status coverage", () => {
      it("should have menu items for PENDING status", () => {
        const pendingMenus = contextMenus.filter(
          (menu: any) =>
            menu.when?.includes("viewItem") && menu.when?.includes("pending"),
        );

        expect(pendingMenus.length).toBeGreaterThan(0);
      });

      it("should have menu items for IMPLEMENT status", () => {
        const implementMenus = contextMenus.filter(
          (menu: any) =>
            menu.when?.includes("viewItem") && menu.when?.includes("implement"),
        );

        expect(implementMenus.length).toBeGreaterThan(0);
      });

      it("should have menu items for ESCALATED status", () => {
        const escalatedMenus = contextMenus.filter(
          (menu: any) =>
            menu.when?.includes("viewItem") && menu.when?.includes("escalated"),
        );

        expect(escalatedMenus.length).toBeGreaterThan(0);
      });

      it("should have menu items for VERIFY_FAILED status", () => {
        const verifyFailedMenus = contextMenus.filter(
          (menu: any) =>
            menu.when?.includes("viewItem") &&
            menu.when?.includes("verify_failed"),
        );

        expect(verifyFailedMenus.length).toBeGreaterThan(0);
      });
    });
  });
});
