import {
  CliRenderer,
  createCliRenderer,
  BoxRenderable,
  TextRenderable,
  ScrollBoxRenderable,
  KeyEvent,
  engine,
  MouseParser,
} from "@opentui/core";
import { DashboardController } from "./controllers/DashboardController.js";
import { createLandingView } from "./views/LandingView.js";
import { THEME } from "./theme.js";
import { isGameboyActive } from "../games/gameboy/GameboyView.js";
import { MultiLineInputRenderable, MultiLineInputEvents } from "./components/MultiLineInput.js";
import { buildVerticalBar, createInputContainerMouseHandler, createProviderMetadataRow, createCtrlCExitHandler } from "./input-chrome.js";

export async function createDashboard(renderer: CliRenderer, initialPrompt?: string) {
  const INPUT_CHROME_LINES = 4;

  const root = new BoxRenderable(renderer, {
    id: "dashboard-root",
    width: "100%",
    height: "100%",
    flexDirection: "column",
    backgroundColor: THEME.bg,
    paddingLeft: 4,
    paddingRight: 4,
  });

  const mouseParser = new MouseParser();
  renderer.addInputHandler((seq) => {
    const mouse = mouseParser.parseMouseEvent(Buffer.from(seq));
    if (mouse) {
      // Mouse events handled here if needed
    }
    return false;
  });

  const mainContent = new BoxRenderable(renderer, {
    id: "mainContent",
    width: "100%",
    flexGrow: 1,
    flexDirection: "column",
    justifyContent: "flex-start",
    alignItems: "center",
    paddingTop: 1,
    backgroundColor: THEME.bg,
  });

  const separator = new BoxRenderable(renderer, {
    id: "separator",
    width: "96%",
    height: 1,
    border: ["bottom"],
    borderColor: THEME.darkAccent,
    marginBottom: 1,
    flexShrink: 0,
    alignSelf: "center",
    visible: false,
  });

  const sessionContainer = new BoxRenderable(renderer, {
    id: "sessionContainer",
    width: "100%",
    flexGrow: 1,
    flexDirection: "column",
    alignItems: "stretch",
    gap: 0,
  });



  const dashboardView = new ScrollBoxRenderable(renderer, {
    id: "dashboardView",
    width: "100%",
    flexGrow: 1,
    flexDirection: "column",
    scrollY: true,
    scrollX: false,
    scrollbarOptions: {
      trackOptions: {
        backgroundColor: THEME.darkAccent,
        foregroundColor: THEME.accent,
      },
    },
  });

  const toyboxView = new BoxRenderable(renderer, {
    id: "toyboxView",
    width: "100%",
    flexGrow: 1,
    flexDirection: "column",
    visible: false,
    backgroundColor: THEME.bg,
  });

  const inputGroup = new BoxRenderable(renderer, {
    id: "inputGroup",
    width: "100%",
    flexDirection: "column",
    flexShrink: 0,
    border: ["top"],
    borderColor: THEME.darkAccent,
    paddingTop: 1,
    marginBottom: 1,
  });

  const inputContainer = new BoxRenderable(renderer, {
    id: "inputContainer",
    width: "100%",
    minHeight: 5,
    flexDirection: "column",
    backgroundColor: THEME.surface,
    paddingLeft: 1,
    paddingRight: 1,
  });

  const input = new MultiLineInputRenderable(renderer, {
    id: "input",
    flexGrow: 1,
    placeholder: 'Try "Write unit tests for this file"',
    textColor: THEME.text,
    focusedTextColor: THEME.text,
    minHeight: 1,
    maxHeight: 10,
  });

  const inputRow = new BoxRenderable(renderer, {
    id: "inputRow",
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
  });

  inputRow.add(input);

  inputContainer.onMouse = createInputContainerMouseHandler(inputContainer, input);

  const { row: metadataRow, pickleLabel: metadataRowL, modelLabel } = createProviderMetadataRow(renderer, "metadataRow");

  inputContainer.add(new BoxRenderable(renderer, { id: "spacer1", height: 1 }));
  inputContainer.add(inputRow);
  inputContainer.add(new BoxRenderable(renderer, { id: "spacer2", height: 1 }));
  inputContainer.add(metadataRow);
  inputContainer.add(new BoxRenderable(renderer, { id: "spacer3", height: 1 }));

  const inputDecorativeBar = new TextRenderable(renderer, {
    id: "inputDecorativeBar",
    content: buildVerticalBar(inputContainer.minHeight ?? 5),
    fg: THEME.accent,
    position: "absolute",
    left: 0,
    top: 0,
  });
  inputContainer.add(inputDecorativeBar);

  inputGroup.add(inputContainer);

  const globalFooter = new BoxRenderable(renderer, {
    id: "globalFooter",
    width: "100%",
    height: 1,
    backgroundColor: THEME.bg,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingLeft: 1,
    paddingRight: 1,
    flexShrink: 0,
  });

  const footerLeft = new TextRenderable(renderer, {
    id: "footerLeft",
    content: "CTRL+T: Toybox",
    fg: THEME.dim,
  });

  const footerRight = new TextRenderable(renderer, {
    id: "footerRight",
    content: "",
    fg: THEME.dim,
  });

  globalFooter.add(footerLeft);
  globalFooter.add(footerRight);

  const controller = new DashboardController(renderer, sessionContainer);

  const landingView = await createLandingView(renderer, (prompt, mode) => {
    controller.startDashboardSession(prompt, mode);
  });

  controller.ui = {
    tabs: undefined,
    separator: separator,
    dashboardView: dashboardView,
    toyboxView: toyboxView,
    inputGroup: inputGroup,
    landingView: landingView.root,
    mainContent: mainContent,
    globalFooter: globalFooter,
    input: input,
    inputContainer: inputContainer,

    metadataLabel: metadataRowL,
    modelLabel: modelLabel,
    footerLeft: footerLeft,
    footerRight: footerRight,
  };

  input.focus();

  const syncInputChrome = () => {
    const minHeight = typeof inputContainer.minHeight === "number" ? inputContainer.minHeight : 5;
    const inputHeight = typeof input.height === "number" ? input.height : 1;
    const nextHeight = Math.max(minHeight, inputHeight + INPUT_CHROME_LINES);
    if (inputContainer.height !== nextHeight) {
      inputContainer.height = nextHeight;
      inputDecorativeBar.content = buildVerticalBar(nextHeight);
      renderer.requestRender();
    }
  };

  syncInputChrome();


  // Handle form submission on Enter
  input.on(MultiLineInputEvents.SUBMIT, (value: string) => {
    if (controller.hasActivePicker() || isGameboyActive()) return;
    controller.spawnSession(value);
    input.value = "";
    syncInputChrome();
  });

  input.on(MultiLineInputEvents.INPUT, () => {
    syncInputChrome();
  });

  renderer.keyInput.on("keypress", (key: KeyEvent) => {
    if (controller.hasActivePicker() || isGameboyActive()) return false;

    // Handle Ctrl+T to toggle toybox
    if (key.ctrl && key.name === "t") {
      controller.toggleToybox?.();
      return true;
    }
    
    // Let other keys propagate to the focused input
    return false;
  });

  dashboardView.add(separator);
  dashboardView.add(sessionContainer);

  mainContent.add(dashboardView);
  mainContent.add(toyboxView);
  mainContent.add(inputGroup);

  root.add(landingView.root);
  root.add(mainContent);
  root.add(globalFooter);

  if (initialPrompt) {
    landingView.root.visible = false;
    mainContent.visible = true;
    globalFooter.visible = true;
    controller.spawnSession(initialPrompt);
    input.focus();
  } else {
    landingView.root.visible = true;
    mainContent.visible = false;
    globalFooter.visible = false;
    landingView.input.focus();
  }

  return { root, sessionContainer, input };
}

export async function startDashboard(initialPrompt?: string) {
  try {
    const renderer = await createCliRenderer({ exitOnCtrlC: false, targetFps: 100 });
    renderer.useMouse = true;

    engine.attach(renderer);

    const dashboard = await createDashboard(renderer, initialPrompt);
    renderer.root.add(dashboard.root);

    // Get footer reference for hints
    const footerLeft = dashboard.root.getChildren()
      .find(c => c.id === "globalFooter")
      ?.getChildren()
      .find(c => c.id === "footerLeft") as TextRenderable | undefined;

    if (footerLeft) {
      const exitHandler = createCtrlCExitHandler({
        renderer,
        hintText: footerLeft,
        originalContent: footerLeft.content || "",
      });
      renderer.keyInput.on("keypress", exitHandler);
    }

    renderer.start();
  } catch (error) {
    console.error("❌ Failed to start Pickle Rick Dashboard:", error);
    process.exit(1);
  }
}
