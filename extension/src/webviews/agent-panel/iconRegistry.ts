/**
 * Icon Registry for Agent Panel
 *
 * Pre-registers all Lucide icons used in the application to avoid
 * runtime fetching from the Iconify CDN. This fixes:
 * - Delayed/missing icons due to network latency
 * - CSP issues in restricted environments
 * - Reduced CPU usage from eliminated network requests
 *
 * Icons are registered synchronously before the app renders.
 */

import { addIcon } from "iconify-icon";

// Import icons from @iconify-icons/lucide - these have proper stroke attributes
import activity from "@iconify-icons/lucide/activity";
import alertCircle from "@iconify-icons/lucide/alert-circle";
import alertTriangle from "@iconify-icons/lucide/alert-triangle";
import arrowRight from "@iconify-icons/lucide/arrow-right";
import badge from "@iconify-icons/lucide/badge";
import badgeCheck from "@iconify-icons/lucide/badge-check";
import badgeX from "@iconify-icons/lucide/badge-x";
import ban from "@iconify-icons/lucide/ban";
import barChart from "@iconify-icons/lucide/bar-chart";
import bookOpen from "@iconify-icons/lucide/book-open";
import bot from "@iconify-icons/lucide/bot";
import brain from "@iconify-icons/lucide/brain";
import check from "@iconify-icons/lucide/check";
import checkCircle from "@iconify-icons/lucide/check-circle";
import checkSquare from "@iconify-icons/lucide/check-square";
import chevronDown from "@iconify-icons/lucide/chevron-down";
import chevronRight from "@iconify-icons/lucide/chevron-right";
import chevronUp from "@iconify-icons/lucide/chevron-up";
import circle from "@iconify-icons/lucide/circle";
import clipboardCheck from "@iconify-icons/lucide/clipboard-check";
import clipboardList from "@iconify-icons/lucide/clipboard-list";
import clock from "@iconify-icons/lucide/clock";
import code2 from "@iconify-icons/lucide/code-2";
import copy from "@iconify-icons/lucide/copy";
import edit3 from "@iconify-icons/lucide/edit-3";
import eye from "@iconify-icons/lucide/eye";
import fileCheck from "@iconify-icons/lucide/file-check";
import fileCode from "@iconify-icons/lucide/file-code";
import fileDiff from "@iconify-icons/lucide/file-diff";
import fileEdit from "@iconify-icons/lucide/file-edit";
import fileMinus from "@iconify-icons/lucide/file-minus";
import fileOutput from "@iconify-icons/lucide/file-output";
import filePlus from "@iconify-icons/lucide/file-plus";
import fileSymlink from "@iconify-icons/lucide/file-symlink";
import fileText from "@iconify-icons/lucide/file-text";
import files from "@iconify-icons/lucide/files";
import flag from "@iconify-icons/lucide/flag";
import folderOpen from "@iconify-icons/lucide/folder-open";
import folderPlus from "@iconify-icons/lucide/folder-plus";
import folderSearch from "@iconify-icons/lucide/folder-search";
import folderSymlink from "@iconify-icons/lucide/folder-symlink";
import hammer from "@iconify-icons/lucide/hammer";
import helpCircle from "@iconify-icons/lucide/help-circle";
import hourglass from "@iconify-icons/lucide/hourglass";
import inbox from "@iconify-icons/lucide/inbox";
import keyboard from "@iconify-icons/lucide/keyboard";
import layoutList from "@iconify-icons/lucide/layout-list";
import lightbulb from "@iconify-icons/lucide/lightbulb";
import link from "@iconify-icons/lucide/link";
import list from "@iconify-icons/lucide/list";
import loader from "@iconify-icons/lucide/loader";
import loader2 from "@iconify-icons/lucide/loader-2";
import logIn from "@iconify-icons/lucide/log-in";
import logOut from "@iconify-icons/lucide/log-out";
import messageCircle from "@iconify-icons/lucide/message-circle";
import messageSquare from "@iconify-icons/lucide/message-square";
import network from "@iconify-icons/lucide/network";
import paperclip from "@iconify-icons/lucide/paperclip";
import pause from "@iconify-icons/lucide/pause";
import pencilLine from "@iconify-icons/lucide/pencil-line";
import play from "@iconify-icons/lucide/play";
import playCircle from "@iconify-icons/lucide/play-circle";
import plus from "@iconify-icons/lucide/plus";
import refreshCw from "@iconify-icons/lucide/refresh-cw";
import repeat from "@iconify-icons/lucide/repeat";
import replace from "@iconify-icons/lucide/replace";
import replaceAll from "@iconify-icons/lucide/replace-all";
import scissors from "@iconify-icons/lucide/scissors";
import scrollText from "@iconify-icons/lucide/scroll-text";
import search from "@iconify-icons/lucide/search";
import send from "@iconify-icons/lucide/send";
import square from "@iconify-icons/lucide/square";
import stopCircle from "@iconify-icons/lucide/stop-circle";
import terminal from "@iconify-icons/lucide/terminal";
import terminalSquare from "@iconify-icons/lucide/terminal-square";
import testTube from "@iconify-icons/lucide/test-tube";
import testTube2 from "@iconify-icons/lucide/test-tube-2";
import textCursorInput from "@iconify-icons/lucide/text-cursor-input";
import trash2 from "@iconify-icons/lucide/trash-2";
import wrench from "@iconify-icons/lucide/wrench";
import x from "@iconify-icons/lucide/x";
import xCircle from "@iconify-icons/lucide/x-circle";

/**
 * Register all Lucide icons used in the agent panel.
 * Call this ONCE before rendering the app.
 */
export function registerIcons(): void {
  // ToolIcon.tsx tool mapping icons - CODING
  addIcon("lucide:file-text", fileText);
  addIcon("lucide:file-edit", fileEdit);
  addIcon("lucide:file-pen", pencilLine); // Using pencil-line as file-pen doesn't exist
  addIcon("lucide:file-plus", filePlus);
  addIcon("lucide:file-minus", fileMinus);
  addIcon("lucide:folder-plus", folderPlus);
  addIcon("lucide:folder-open", folderOpen);
  addIcon("lucide:folder-search", folderSearch);
  addIcon("lucide:text-cursor-input", textCursorInput);
  addIcon("lucide:scissors", scissors);
  addIcon("lucide:replace", replace);
  addIcon("lucide:replace-all", replaceAll);
  addIcon("lucide:check-square", checkSquare);
  addIcon("lucide:search", search);
  addIcon("lucide:link", link);

  // ToolIcon.tsx tool mapping icons - FILESYSTEM
  addIcon("lucide:copy", copy);
  addIcon("lucide:file-symlink", fileSymlink);
  addIcon("lucide:folder-symlink", folderSymlink);

  // ToolIcon.tsx tool mapping icons - SYSTEM
  addIcon("lucide:terminal", terminal);
  addIcon("lucide:terminal-square", terminalSquare);
  addIcon("lucide:square-terminal", terminalSquare); // Using terminal-square as square-terminal doesn't exist
  addIcon("lucide:play", play);
  addIcon("lucide:play-circle", playCircle);
  addIcon("lucide:stop-circle", stopCircle);
  addIcon("lucide:pause", pause);
  addIcon("lucide:square", square);
  addIcon("lucide:test-tube", testTube);
  addIcon("lucide:test-tube-2", testTube2);
  addIcon("lucide:alert-circle", alertCircle);
  addIcon("lucide:alert-triangle", alertTriangle);
  addIcon("lucide:scroll-text", scrollText);
  addIcon("lucide:list", list);
  addIcon("lucide:keyboard", keyboard);
  addIcon("lucide:clock", clock);
  addIcon("lucide:network", network);
  addIcon("lucide:repeat", repeat);

  // ToolIcon.tsx tool mapping icons - ORCHESTRA
  addIcon("lucide:clipboard-list", clipboardList);
  addIcon("lucide:clipboard-check", clipboardCheck);
  addIcon("lucide:flag", flag);
  addIcon("lucide:message-circle", messageCircle);
  addIcon("lucide:message-square", messageSquare);
  addIcon("lucide:bar-chart", barChart);
  addIcon("lucide:layout-list", layoutList);
  addIcon("lucide:file-check", fileCheck);
  addIcon("lucide:file-output", fileOutput);
  addIcon("lucide:file-diff", fileDiff);
  addIcon("lucide:file-code", fileCode);

  // Status icons
  addIcon("lucide:check-circle", checkCircle);
  addIcon("lucide:x-circle", xCircle);
  addIcon("lucide:badge-check", badgeCheck);
  addIcon("lucide:badge-x", badgeX);
  addIcon("lucide:badge", badge);

  // Misc tool icons
  addIcon("lucide:code-2", code2);
  addIcon("lucide:book-open", bookOpen);
  addIcon("lucide:wrench", wrench);

  // UI icons used in various components
  addIcon("lucide:chevron-down", chevronDown);
  addIcon("lucide:chevron-up", chevronUp);
  addIcon("lucide:chevron-right", chevronRight);
  addIcon("lucide:activity", activity);
  addIcon("lucide:arrow-right", arrowRight);
  addIcon("lucide:loader", loader);
  addIcon("lucide:loader-2", loader2);
  addIcon("lucide:files", files);
  addIcon("lucide:plus", plus);
  addIcon("lucide:edit-3", edit3);
  addIcon("lucide:trash-2", trash2);
  addIcon("lucide:eye", eye);
  addIcon("lucide:bot", bot);
  addIcon("lucide:hammer", hammer);
  addIcon("lucide:help-circle", helpCircle);
  addIcon("lucide:circle", circle);
  addIcon("lucide:brain", brain);
  addIcon("lucide:check", check);
  addIcon("lucide:x", x);
  addIcon("lucide:ban", ban);
  addIcon("lucide:refresh-cw", refreshCw);
  addIcon("lucide:hourglass", hourglass);
  addIcon("lucide:inbox", inbox);
  addIcon("lucide:log-in", logIn);
  addIcon("lucide:log-out", logOut);
  addIcon("lucide:paperclip", paperclip);
  addIcon("lucide:lightbulb", lightbulb);
  addIcon("lucide:send", send);
}
