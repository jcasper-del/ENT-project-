import React, { useEffect, useMemo, useState } from "react";
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
  Share,
  Switch,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Clipboard from "expo-clipboard";

const STORAGE_KEYS = {
  cancerType: "mhai_cancerType",
  stage: "mhai_stage",
  goal: "mhai_goal",
  aiAnswer: "mhai_aiAnswer",
  savedPrompt: "mhai_savedPrompt",
  selectedTemplateId: "mhai_selectedTemplateId",
  doctorQuestions: "mhai_doctorQuestions",
  favoritePrompts: "mhai_favoritePrompts",
  recentActivity: "mhai_recentActivity",
  visitSymptoms: "mhai_visitSymptoms",
  visitQuestions: "mhai_visitQuestions",
  visitDoctorAnswers: "mhai_visitDoctorAnswers",
  sourceSearch: "mhai_sourceSearch",
  darkMode: "mhai_darkMode",
};

const AUTH_KEYS = {
  users: "mhai_users",
  loggedInUser: "mhai_loggedInUser",
};

const questionTemplates = [
  {
    id: 1,
    title: "Understand my treatment plan",
    prompt:
      "Explain the usual treatment options for [type of ENT cancer] at [stage] in simple language, and list questions I should ask my doctor.",
  },
  {
    id: 2,
    title: "Check if an AI answer sounds safe",
    prompt:
      "Review this answer about my ENT cancer treatment. Tell me what sounds too general, what may be missing, and what should be verified with my doctor: [paste answer]",
  },
  {
    id: 3,
    title: "Prepare for my appointment",
    prompt:
      "Help me make a short list of questions to ask my ENT surgeon or oncologist about side effects, recovery, and next steps.",
  },
  {
    id: 4,
    title: "Understand side effects",
    prompt:
      "What side effects are commonly discussed for surgery, radiation, or chemotherapy for [type of ENT cancer], and which symptoms should be reported right away?",
  },
];

const trustedSources = [
  {
    id: 1,
    name: "National Cancer Institute",
    reason: "Doctor-reviewed cancer treatment information",
    tip: "Use this to compare broad AI answers against cancer-specific education pages.",
  },
  {
    id: 2,
    name: "American Cancer Society",
    reason: "Patient-friendly cancer education and support",
    tip: "Use this for plain-language explanations and side-effect information.",
  },
  {
    id: 3,
    name: "Your ENT surgeon / oncologist",
    reason: "Knows your exact diagnosis and treatment plan",
    tip: "Always verify treatment decisions with your actual care team.",
  },
  {
    id: 4,
    name: "Hospital nurse navigator",
    reason: "Can explain logistics, side effects, and follow-up care",
    tip: "Ask them for help turning confusing information into next steps.",
  },
];

function buildCustomPrompt(cancerType, stage, goal) {
  const typeText = cancerType.trim() || "my ENT cancer";
  const stageText = stage.trim() || "my current stage";
  const goalText = goal.trim() || "understand my treatment options safely";

  return `I am a patient trying to ${goalText}. Please give general educational information only, not a diagnosis. Remind me to verify anything important with my ENT doctor. My cancer type: ${typeText}. My stage or details: ${stageText}. Tell me what questions I should ask my care team and what parts of this topic depend on my exact diagnosis.`;
}

function fillTemplateText(templatePrompt, cancerType, stage) {
  return templatePrompt
    .replace("[type of ENT cancer]", cancerType || "type of ENT cancer")
    .replace("[stage]", stage || "stage");
}

function reviewAiAnswer(aiAnswer) {
  if (!aiAnswer.trim()) {
    return {
      checks: [],
      positives: [],
      missing: [],
      verify: [],
      unsafeCount: 0,
    };
  }

  const lower = aiAnswer.toLowerCase();
  const checks = [];
  const positives = [];
  const missing = [];
  const verify = [];
  let unsafeCount = 0;

  const hasDoctorMention =
    lower.includes("doctor") ||
    lower.includes("oncologist") ||
    lower.includes("care team") ||
    lower.includes("surgeon");

  const hasPersonalization =
    lower.includes("stage") ||
    lower.includes("type") ||
    lower.includes("diagnosis") ||
    lower.includes("depends") ||
    lower.includes("case");

  const hasRiskLanguage =
    lower.includes("side effect") ||
    lower.includes("side effects") ||
    lower.includes("risk") ||
    lower.includes("symptom") ||
    lower.includes("warning");

  const hasUncertainty =
    lower.includes("may") ||
    lower.includes("can") ||
    lower.includes("depends") ||
    lower.includes("often") ||
    lower.includes("sometimes");

  const hasOverconfidence =
    lower.includes("definitely") ||
    lower.includes("always") ||
    lower.includes("guaranteed") ||
    lower.includes("best option for everyone") ||
    lower.includes("standard for everyone");

  const hasUnsafeAdvice =
    lower.includes("stop treatment") ||
    lower.includes("skip treatment") ||
    lower.includes("ignore your doctor") ||
    lower.includes("don't need your doctor") ||
    lower.includes("no need to tell your doctor");

  if (hasDoctorMention) {
    positives.push(
      "The answer does remind the patient to involve a doctor or care team."
    );
  } else {
    checks.push(
      "This answer does not clearly tell the patient to confirm details with a doctor."
    );
    missing.push(
      "A reminder to verify advice with an ENT doctor or oncologist."
    );
  }

  if (hasPersonalization) {
    positives.push(
      "The answer seems to recognize that treatment can depend on the exact diagnosis."
    );
  } else {
    checks.push(
      "This answer may be too general because it does not mention cancer type, stage, or diagnosis details."
    );
    missing.push(
      "A note that treatment depends on cancer type, stage, and the individual case."
    );
  }

  if (hasRiskLanguage) {
    positives.push(
      "The answer includes at least some mention of side effects, risks, or warning symptoms."
    );
  } else {
    checks.push(
      "This answer may be missing discussion of side effects, risks, or warning symptoms."
    );
    missing.push(
      "Possible side effects, risks, and symptoms that should be reported right away."
    );
  }

  if (!hasUncertainty) {
    checks.push(
      "The wording may sound too absolute instead of explaining that treatment can vary by patient."
    );
    missing.push(
      "More careful language such as 'may,' 'can,' or 'depends on the diagnosis.'"
    );
  }

  if (hasOverconfidence) {
    checks.push(
      "The wording sounds overly certain, which can be risky in medical advice."
    );
    verify.push(
      "Ask your doctor whether this advice really applies to your exact diagnosis and stage."
    );
    unsafeCount += 1;
  }

  if (hasUnsafeAdvice) {
    checks.push(
      "This answer may be unsafe because it suggests treatment changes without proper medical supervision."
    );
    verify.push(
      "Do not make treatment changes without speaking to your doctor."
    );
    unsafeCount += 2;
  }

  if (
    !lower.includes("call") &&
    !lower.includes("report") &&
    !lower.includes("seek urgent")
  ) {
    missing.push(
      "Guidance about which symptoms should be reported quickly to the care team."
    );
  }

  if (verify.length === 0) {
    verify.push(
      "Ask your doctor which parts of the answer fit your exact diagnosis, stage, and treatment plan."
    );
  }

  if (checks.length === 0) {
    checks.push(
      "No obvious red flag was detected by this checker, but the answer should still be verified with a medical professional."
    );
  }

  return {
    checks,
    positives,
    missing,
    verify,
    unsafeCount,
  };
}

function getRiskLevel(review) {
  const count = review.checks.length + review.unsafeCount;

  if (review.checks.length === 0) {
    return {
      label: "No review yet",
      color: "#7a7a7a",
      score: 0,
      summary: "Paste an AI answer to begin the review.",
      nextStep: "Review the answer carefully with your care team.",
      bar: "gray",
    };
  }

  if (count >= 6) {
    return {
      label: "High risk",
      color: "#b91c1c",
      score: 28,
      summary:
        "This answer may be misleading or unsafe because it sounds too certain or leaves out important medical context.",
      nextStep:
        "Do not rely on it alone. Show it to your doctor or nurse navigator and ask what is accurate for your case.",
      bar: "red",
    };
  }

  if (count >= 3) {
    return {
      label: "Moderate risk",
      color: "#d97706",
      score: 61,
      summary:
        "This answer may contain some useful information, but it seems too general or incomplete.",
      nextStep:
        "Use it only as a starting point and ask your doctor what parts apply to your diagnosis.",
      bar: "yellow",
    };
  }

  return {
    label: "Low risk",
    color: "#15803d",
    score: 84,
    summary:
      "This answer has fewer obvious warning signs, but it still should not replace professional medical advice.",
    nextStep: "Double-check the details with your doctor before acting on it.",
    bar: "green",
  };
}

function createDoctorQuestions(cancerType, stage) {
  const typeText = cancerType.trim() || "my cancer";
  const stageText = stage.trim() || "my current stage";
  const baseId = Date.now().toString();

  return [
    {
      id: `${baseId}_1`,
      text: `What are the main treatment options for ${typeText} at ${stageText}?`,
      asked: false,
    },
    {
      id: `${baseId}_2`,
      text: "Why is this treatment being recommended for my case specifically?",
      asked: false,
    },
    {
      id: `${baseId}_3`,
      text: "What side effects should I expect right away and later on?",
      asked: false,
    },
    {
      id: `${baseId}_4`,
      text: "Which symptoms mean I should call the office immediately?",
      asked: false,
    },
    {
      id: `${baseId}_5`,
      text: "Are there other options I should understand before deciding?",
      asked: false,
    },
  ];
}

function getTheme(darkMode) {
  if (darkMode) {
    return {
      background: "#0f172a",
      card: "#111827",
      cardSoft: "#1f2937",
      text: "#f8fafc",
      subtext: "#cbd5e1",
      border: "#334155",
      primary: "#FFCB05",
      navy: "#0b1b34",
      navyText: "#e2e8f0",
      inputBg: "#0f172a",
      inputText: "#f8fafc",
      noticeBg: "#332701",
      noticeBorder: "#8b6b00",
      noticeText: "#fde68a",
      green: "#22c55e",
      red: "#ef4444",
      yellow: "#f59e0b",
      white: "#ffffff",
    };
  }

  return {
    background: "#f4f7fb",
    card: "#ffffff",
    cardSoft: "#f3f6fb",
    text: "#00274C",
    subtext: "#4b6177",
    border: "#d8e2f0",
    primary: "#FFCB05",
    navy: "#00274C",
    navyText: "#dce7f5",
    inputBg: "#f1f5f9",
    inputText: "#132238",
    noticeBg: "#fff8dc",
    noticeBorder: "#f2d670",
    noticeText: "#7a5a00",
    green: "#15803d",
    red: "#b91c1c",
    yellow: "#d97706",
    white: "#ffffff",
  };
}

export default function App() {
  const [screen, setScreen] = useState("welcome");

  const [cancerType, setCancerType] = useState("");
  const [stage, setStage] = useState("");
  const [goal, setGoal] = useState("");
  const [aiAnswer, setAiAnswer] = useState("");
  const [savedPrompt, setSavedPrompt] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [doctorQuestions, setDoctorQuestions] = useState([]);
  const [favoritePrompts, setFavoritePrompts] = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);
  const [visitSymptoms, setVisitSymptoms] = useState("");
  const [visitQuestions, setVisitQuestions] = useState("");
  const [visitDoctorAnswers, setVisitDoctorAnswers] = useState("");
  const [sourceSearch, setSourceSearch] = useState("");
  const [darkMode, setDarkMode] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  const [signupName, setSignupName] = useState("");
  const [signupUsername, setSignupUsername] = useState("");
  const [signupPassword, setSignupPassword] = useState("");

  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  const [loggedInUser, setLoggedInUser] = useState(null);

  const theme = useMemo(() => getTheme(darkMode), [darkMode]);

  const customPrompt = useMemo(() => {
    return buildCustomPrompt(cancerType, stage, goal);
  }, [cancerType, stage, goal]);

  const safetyReview = useMemo(() => {
    return reviewAiAnswer(aiAnswer);
  }, [aiAnswer]);

  const riskLevel = useMemo(() => {
    return getRiskLevel(safetyReview);
  }, [safetyReview]);

  const filteredSources = useMemo(() => {
    const query = sourceSearch.trim().toLowerCase();
    if (!query) return trustedSources;

    return trustedSources.filter(
      (source) =>
        source.name.toLowerCase().includes(query) ||
        source.reason.toLowerCase().includes(query) ||
        source.tip.toLowerCase().includes(query)
    );
  }, [sourceSearch]);

  useEffect(() => {
    loadSavedData();
    loadAuthData();
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    saveField(STORAGE_KEYS.cancerType, cancerType);
  }, [cancerType, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    saveField(STORAGE_KEYS.stage, stage);
  }, [stage, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    saveField(STORAGE_KEYS.goal, goal);
  }, [goal, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    saveField(STORAGE_KEYS.aiAnswer, aiAnswer);
  }, [aiAnswer, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    saveField(STORAGE_KEYS.savedPrompt, savedPrompt);
  }, [savedPrompt, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    saveField(
      STORAGE_KEYS.selectedTemplateId,
      selectedTemplateId === null ? "" : String(selectedTemplateId)
    );
  }, [selectedTemplateId, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    saveField(STORAGE_KEYS.doctorQuestions, JSON.stringify(doctorQuestions));
  }, [doctorQuestions, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    saveField(STORAGE_KEYS.favoritePrompts, JSON.stringify(favoritePrompts));
  }, [favoritePrompts, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    saveField(STORAGE_KEYS.recentActivity, JSON.stringify(recentActivity));
  }, [recentActivity, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    saveField(STORAGE_KEYS.visitSymptoms, visitSymptoms);
  }, [visitSymptoms, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    saveField(STORAGE_KEYS.visitQuestions, visitQuestions);
  }, [visitQuestions, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    saveField(STORAGE_KEYS.visitDoctorAnswers, visitDoctorAnswers);
  }, [visitDoctorAnswers, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    saveField(STORAGE_KEYS.sourceSearch, sourceSearch);
  }, [sourceSearch, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    saveField(STORAGE_KEYS.darkMode, darkMode ? "true" : "false");
  }, [darkMode, isLoaded]);

  const loadSavedData = async () => {
    try {
      const values = await AsyncStorage.multiGet(Object.values(STORAGE_KEYS));
      const data = Object.fromEntries(values);

      setCancerType(data[STORAGE_KEYS.cancerType] || "");
      setStage(data[STORAGE_KEYS.stage] || "");
      setGoal(data[STORAGE_KEYS.goal] || "");
      setAiAnswer(data[STORAGE_KEYS.aiAnswer] || "");
      setSavedPrompt(data[STORAGE_KEYS.savedPrompt] || "");
      setVisitSymptoms(data[STORAGE_KEYS.visitSymptoms] || "");
      setVisitQuestions(data[STORAGE_KEYS.visitQuestions] || "");
      setVisitDoctorAnswers(data[STORAGE_KEYS.visitDoctorAnswers] || "");
      setSourceSearch(data[STORAGE_KEYS.sourceSearch] || "");
      setDarkMode(data[STORAGE_KEYS.darkMode] === "true");

      const savedTemplate = data[STORAGE_KEYS.selectedTemplateId];
      setSelectedTemplateId(
        savedTemplate && savedTemplate !== "" ? Number(savedTemplate) : null
      );

      const savedQuestions = data[STORAGE_KEYS.doctorQuestions];
      setDoctorQuestions(savedQuestions ? JSON.parse(savedQuestions) : []);

      const savedFavorites = data[STORAGE_KEYS.favoritePrompts];
      setFavoritePrompts(savedFavorites ? JSON.parse(savedFavorites) : []);

      const savedActivity = data[STORAGE_KEYS.recentActivity];
      setRecentActivity(savedActivity ? JSON.parse(savedActivity) : []);
    } catch (error) {
      Alert.alert("Save error", "Could not load saved app data.");
    } finally {
      setIsLoaded(true);
    }
  };

  const loadAuthData = async () => {
    try {
      const savedUser = await AsyncStorage.getItem(AUTH_KEYS.loggedInUser);

      if (savedUser) {
        const parsedUser = JSON.parse(savedUser);
        setLoggedInUser(parsedUser);
        setScreen("home");
      }
    } catch (error) {
      Alert.alert("Login error", "Could not load login session.");
    }
  };

  const saveField = async (key, value) => {
    try {
      await AsyncStorage.setItem(key, String(value));
    } catch (error) {}
  };

  const addActivity = (text) => {
    const newItem = {
      id: Date.now().toString(),
      text,
      time: new Date().toLocaleString(),
    };

    setRecentActivity((prev) => [newItem, ...prev].slice(0, 8));
  };

  const createAccount = async () => {
    if (
      !signupName.trim() ||
      !signupUsername.trim() ||
      !signupPassword.trim()
    ) {
      Alert.alert("Missing info", "Please fill in all fields.");
      return;
    }

    try {
      const existingUsersRaw = await AsyncStorage.getItem(AUTH_KEYS.users);
      const existingUsers = existingUsersRaw
        ? JSON.parse(existingUsersRaw)
        : [];

      const alreadyExists = existingUsers.some(
        (user) =>
          user.username.toLowerCase() === signupUsername.trim().toLowerCase()
      );

      if (alreadyExists) {
        Alert.alert("Username taken", "Try a different username.");
        return;
      }

      const newUser = {
        name: signupName.trim(),
        username: signupUsername.trim(),
        password: signupPassword,
      };

      const updatedUsers = [...existingUsers, newUser];

      await AsyncStorage.setItem(AUTH_KEYS.users, JSON.stringify(updatedUsers));
      await AsyncStorage.setItem(
        AUTH_KEYS.loggedInUser,
        JSON.stringify({
          name: newUser.name,
          username: newUser.username,
        })
      );

      setLoggedInUser({
        name: newUser.name,
        username: newUser.username,
      });

      setSignupName("");
      setSignupUsername("");
      setSignupPassword("");
      addActivity("Created a new account");
      setScreen("home");
    } catch (error) {
      Alert.alert("Sign up failed", "Could not create account.");
    }
  };

  const loginAccount = async () => {
    if (!loginUsername.trim() || !loginPassword.trim()) {
      Alert.alert("Missing info", "Enter your username and password.");
      return;
    }

    try {
      const existingUsersRaw = await AsyncStorage.getItem(AUTH_KEYS.users);
      const existingUsers = existingUsersRaw
        ? JSON.parse(existingUsersRaw)
        : [];

      const matchedUser = existingUsers.find(
        (user) =>
          user.username === loginUsername.trim() &&
          user.password === loginPassword
      );

      if (!matchedUser) {
        Alert.alert("Login failed", "Incorrect username or password.");
        return;
      }

      const safeUser = {
        name: matchedUser.name,
        username: matchedUser.username,
      };

      await AsyncStorage.setItem(
        AUTH_KEYS.loggedInUser,
        JSON.stringify(safeUser)
      );

      setLoggedInUser(safeUser);
      setLoginUsername("");
      setLoginPassword("");
      addActivity("Logged into the app");
      setScreen("home");
    } catch (error) {
      Alert.alert("Login failed", "Could not log in.");
    }
  };

  const forgotPassword = async () => {
    if (!loginUsername.trim()) {
      Alert.alert("Enter username", "Type your username first.");
      return;
    }

    try {
      const existingUsersRaw = await AsyncStorage.getItem(AUTH_KEYS.users);
      const existingUsers = existingUsersRaw
        ? JSON.parse(existingUsersRaw)
        : [];

      const matchedUser = existingUsers.find(
        (user) => user.username === loginUsername.trim()
      );

      if (!matchedUser) {
        Alert.alert("Not found", "No account matches that username.");
        return;
      }

      Alert.alert(
        "Demo password reminder",
        `This demo app stores the password locally.\n\nPassword: ${matchedUser.password}`
      );
    } catch (error) {
      Alert.alert("Reset failed", "Could not check saved accounts.");
    }
  };

  const logoutAccount = async () => {
    try {
      await AsyncStorage.removeItem(AUTH_KEYS.loggedInUser);
      setLoggedInUser(null);
      addActivity("Logged out");
      setScreen("welcome");
    } catch (error) {
      Alert.alert("Logout failed", "Could not log out.");
    }
  };

  const deleteAccount = async () => {
    if (!loggedInUser) return;

    Alert.alert(
      "Delete account",
      "This will delete the local demo account on this device.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const existingUsersRaw = await AsyncStorage.getItem(
                AUTH_KEYS.users
              );
              const existingUsers = existingUsersRaw
                ? JSON.parse(existingUsersRaw)
                : [];

              const updatedUsers = existingUsers.filter(
                (user) => user.username !== loggedInUser.username
              );

              await AsyncStorage.setItem(
                AUTH_KEYS.users,
                JSON.stringify(updatedUsers)
              );
              await AsyncStorage.removeItem(AUTH_KEYS.loggedInUser);

              setLoggedInUser(null);
              addActivity("Deleted the local account");
              setScreen("welcome");
            } catch (error) {
              Alert.alert("Delete failed", "Could not delete the account.");
            }
          },
        },
      ]
    );
  };

  const fillTemplate = (template) => {
    const text = fillTemplateText(template.prompt, cancerType, stage);
    setSelectedTemplateId(template.id);
    setSavedPrompt(text);
    addActivity(`Used template: ${template.title}`);
  };

  const useCustomPrompt = () => {
    setSelectedTemplateId(null);
    setSavedPrompt(customPrompt);
    addActivity("Generated a custom prompt");
  };

  const saveFavoritePrompt = () => {
    if (!savedPrompt.trim()) {
      Alert.alert("No prompt", "Generate a prompt first.");
      return;
    }

    const newFavorite = {
      id: Date.now().toString(),
      text: savedPrompt,
    };

    setFavoritePrompts((prev) => [newFavorite, ...prev].slice(0, 10));
    addActivity("Saved a prompt to favorites");
    Alert.alert("Saved", "Prompt added to favorites.");
  };

  const useFavoritePrompt = (item) => {
    setSavedPrompt(item.text);
    addActivity("Loaded a favorite prompt");
  };

  const deleteFavoritePrompt = (id) => {
    setFavoritePrompts((prev) => prev.filter((item) => item.id !== id));
  };

  const generateDoctorQuestions = () => {
    setDoctorQuestions(createDoctorQuestions(cancerType, stage));
    addActivity("Generated doctor questions");
  };

  const updateDoctorQuestion = (text, index) => {
    const updated = [...doctorQuestions];
    updated[index].text = text;
    setDoctorQuestions(updated);
  };

  const toggleAskedQuestion = (index) => {
    const updated = [...doctorQuestions];
    updated[index].asked = !updated[index].asked;
    setDoctorQuestions(updated);
  };

  const addDoctorQuestion = () => {
    setDoctorQuestions((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        text: "Type your custom question here",
        asked: false,
      },
    ]);
    addActivity("Added a custom doctor question");
  };

  const deleteDoctorQuestion = (index) => {
    const updated = [...doctorQuestions];
    updated.splice(index, 1);
    setDoctorQuestions(updated);
  };

  const moveDoctorQuestionUp = (index) => {
    if (index === 0) return;
    const updated = [...doctorQuestions];
    [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
    setDoctorQuestions(updated);
  };

  const moveDoctorQuestionDown = (index) => {
    if (index === doctorQuestions.length - 1) return;
    const updated = [...doctorQuestions];
    [updated[index + 1], updated[index]] = [updated[index], updated[index + 1]];
    setDoctorQuestions(updated);
  };

  const loadExampleAnswer = () => {
    setAiAnswer(
      "Radiation is always the best option for ENT cancer and it will definitely work. You probably do not need to worry much about side effects. This treatment is standard for everyone."
    );
    addActivity("Loaded an example AI answer");
  };

  const clearAll = async () => {
    setCancerType("");
    setStage("");
    setGoal("");
    setAiAnswer("");
    setSavedPrompt("");
    setSelectedTemplateId(null);
    setDoctorQuestions([]);
    setFavoritePrompts([]);
    setRecentActivity([]);
    setVisitSymptoms("");
    setVisitQuestions("");
    setVisitDoctorAnswers("");
    setSourceSearch("");
    setDarkMode(false);

    try {
      await AsyncStorage.multiRemove(Object.values(STORAGE_KEYS));
      Alert.alert("Cleared", "Saved app data was cleared.");
    } catch (error) {
      Alert.alert("Clear failed", "Some saved data may still remain.");
    }
  };

  const sharePrompt = async () => {
    if (!savedPrompt.trim()) {
      Alert.alert("No prompt yet", "Generate or select a prompt first.");
      return;
    }

    try {
      await Share.share({
        message: savedPrompt,
      });
      addActivity("Shared a prompt");
    } catch (error) {
      Alert.alert("Share failed", "Your device could not open the share menu.");
    }
  };

  const copyPrompt = async () => {
    if (!savedPrompt.trim()) {
      Alert.alert("No prompt yet", "Generate or select a prompt first.");
      return;
    }

    try {
      await Clipboard.setStringAsync(savedPrompt);
      addActivity("Copied a prompt");
      Alert.alert("Copied", "Your prompt was copied.");
    } catch (error) {
      Alert.alert("Copy failed", "Could not copy the prompt.");
    }
  };

  const copyDoctorQuestions = async () => {
    if (doctorQuestions.length === 0) {
      Alert.alert("No questions yet", "Generate doctor questions first.");
      return;
    }

    const text = doctorQuestions
      .map(
        (question, index) =>
          `${index + 1}. ${question.text}${question.asked ? " (asked)" : ""}`
      )
      .join("\n");

    try {
      await Clipboard.setStringAsync(text);
      addActivity("Copied doctor questions");
      Alert.alert("Copied", "Doctor questions copied.");
    } catch (error) {
      Alert.alert("Copy failed", "Could not copy the doctor questions.");
    }
  };

  const copyVisitPrep = async () => {
    const compiled = `Symptoms / concerns:\n${
      visitSymptoms || "-"
    }\n\nQuestions for visit:\n${
      visitQuestions || "-"
    }\n\nDoctor answers / notes:\n${visitDoctorAnswers || "-"}`;

    try {
      await Clipboard.setStringAsync(compiled);
      addActivity("Copied visit prep notes");
      Alert.alert("Copied", "Visit prep notes copied.");
    } catch (error) {
      Alert.alert("Copy failed", "Could not copy visit notes.");
    }
  };

  const shareVisitPrep = async () => {
    const compiled = `Symptoms / concerns:\n${
      visitSymptoms || "-"
    }\n\nQuestions for visit:\n${
      visitQuestions || "-"
    }\n\nDoctor answers / notes:\n${visitDoctorAnswers || "-"}`;

    try {
      await Share.share({
        message: compiled,
      });
      addActivity("Shared visit prep notes");
    } catch (error) {
      Alert.alert("Share failed", "Could not open the share menu.");
    }
  };

  const showSourceTip = (source) => {
    Alert.alert(source.name, source.tip);
  };

  const getSaferRewrite = () => {
    if (!aiAnswer.trim()) return "";
    return "A safer version would use careful wording, mention that treatment depends on the exact diagnosis and stage, describe possible risks or side effects, and tell the patient to verify details with their doctor.";
  };

  const renderHeader = (title, subtitle, backTarget = "home") => (
    <View style={[styles.topHeader, { backgroundColor: theme.navy }]}>
      <Text style={[styles.topHeaderTitle, { color: theme.white }]}>
        {title}
      </Text>
      <Text style={[styles.topHeaderSubtitle, { color: theme.navyText }]}>
        {subtitle}
      </Text>

      <Pressable
        style={[styles.backButton, { backgroundColor: theme.primary }]}
        onPress={() => setScreen(backTarget)}
      >
        <Text style={[styles.backButtonText, { color: theme.navy }]}>
          {"<- Back"}
        </Text>
      </Pressable>
    </View>
  );

  const riskBarColor =
    riskLevel.bar === "red"
      ? theme.red
      : riskLevel.bar === "yellow"
      ? theme.yellow
      : riskLevel.bar === "green"
      ? theme.green
      : "#7a7a7a";

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: theme.background }]}
    >
      <ScrollView contentContainerStyle={styles.container}>
        {screen === "welcome" && (
          <>
            <View style={[styles.heroCard, { backgroundColor: theme.navy }]}>
              <Text style={[styles.michiganTop, { color: theme.primary }]}>
                MICHIGAN HEALTH AI
              </Text>
              <Text style={[styles.title, { color: theme.white }]}>
                ENT Cancer AI Safety Guide
              </Text>
              <Text style={[styles.subtitle, { color: theme.navyText }]}>
                Sign in to save your progress, review AI answers, and prepare
                for real conversations with your doctors.
              </Text>
              <View
                style={[styles.maizeLine, { backgroundColor: theme.primary }]}
              />
            </View>

            <View style={[styles.card, { backgroundColor: theme.card }]}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>
                Welcome
              </Text>
              <Text style={[styles.emptyState, { color: theme.subtext }]}>
                Log in or create an account to continue.
              </Text>

              <View style={styles.buttonRow}>
                <Pressable
                  style={[
                    styles.primaryButton,
                    { backgroundColor: theme.navy },
                  ]}
                  onPress={() => setScreen("login")}
                >
                  <Text
                    style={[styles.primaryButtonText, { color: theme.primary }]}
                  >
                    Log In
                  </Text>
                </Pressable>

                <Pressable
                  style={[
                    styles.outlineButton,
                    {
                      backgroundColor: theme.noticeBg,
                      borderColor: theme.primary,
                    },
                  ]}
                  onPress={() => setScreen("signup")}
                >
                  <Text
                    style={[styles.outlineButtonText, { color: theme.text }]}
                  >
                    Create Account
                  </Text>
                </Pressable>
              </View>
            </View>
          </>
        )}

        {screen === "signup" && (
          <>
            {renderHeader(
              "Create Account",
              "Make a simple account to save and use the app.",
              "welcome"
            )}

            <View style={[styles.card, { backgroundColor: theme.card }]}>
              <Text style={[styles.label, { color: theme.text }]}>Name</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.inputBg,
                    color: theme.inputText,
                    borderColor: theme.border,
                  },
                ]}
                value={signupName}
                onChangeText={setSignupName}
                placeholder="Enter your name"
                placeholderTextColor="#7a7a7a"
              />
              <Text
                style={[styles.counterText, { color: theme.subtext }]}
              >{`${signupName.length}/40`}</Text>

              <Text style={[styles.label, { color: theme.text }]}>
                Username
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.inputBg,
                    color: theme.inputText,
                    borderColor: theme.border,
                  },
                ]}
                value={signupUsername}
                onChangeText={setSignupUsername}
                placeholder="Choose a username"
                placeholderTextColor="#7a7a7a"
                autoCapitalize="none"
              />

              <Text style={[styles.label, { color: theme.text }]}>
                Password
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.inputBg,
                    color: theme.inputText,
                    borderColor: theme.border,
                  },
                ]}
                value={signupPassword}
                onChangeText={setSignupPassword}
                placeholder="Create a password"
                placeholderTextColor="#7a7a7a"
                secureTextEntry={!showSignupPassword}
              />

              <Pressable
                style={[
                  styles.smallActionButton,
                  { borderColor: theme.border },
                ]}
                onPress={() => setShowSignupPassword((prev) => !prev)}
              >
                <Text style={[styles.smallActionText, { color: theme.text }]}>
                  {showSignupPassword ? "Hide Password" : "Show Password"}
                </Text>
              </Pressable>

              <View style={styles.buttonRow}>
                <Pressable
                  style={[
                    styles.primaryButton,
                    { backgroundColor: theme.navy },
                  ]}
                  onPress={createAccount}
                >
                  <Text
                    style={[styles.primaryButtonText, { color: theme.primary }]}
                  >
                    Create Account
                  </Text>
                </Pressable>

                <Pressable
                  style={[
                    styles.outlineButton,
                    {
                      backgroundColor: theme.noticeBg,
                      borderColor: theme.primary,
                    },
                  ]}
                  onPress={() => setScreen("welcome")}
                >
                  <Text
                    style={[styles.outlineButtonText, { color: theme.text }]}
                  >
                    Back
                  </Text>
                </Pressable>
              </View>
            </View>
          </>
        )}

        {screen === "login" && (
          <>
            {renderHeader("Log In", "Enter your account details.", "welcome")}

            <View style={[styles.card, { backgroundColor: theme.card }]}>
              <Text style={[styles.label, { color: theme.text }]}>
                Username
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.inputBg,
                    color: theme.inputText,
                    borderColor: theme.border,
                  },
                ]}
                value={loginUsername}
                onChangeText={setLoginUsername}
                placeholder="Enter your username"
                placeholderTextColor="#7a7a7a"
                autoCapitalize="none"
              />

              <Text style={[styles.label, { color: theme.text }]}>
                Password
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.inputBg,
                    color: theme.inputText,
                    borderColor: theme.border,
                  },
                ]}
                value={loginPassword}
                onChangeText={setLoginPassword}
                placeholder="Enter your password"
                placeholderTextColor="#7a7a7a"
                secureTextEntry={!showLoginPassword}
              />

              <Pressable
                style={[
                  styles.smallActionButton,
                  { borderColor: theme.border },
                ]}
                onPress={() => setShowLoginPassword((prev) => !prev)}
              >
                <Text style={[styles.smallActionText, { color: theme.text }]}>
                  {showLoginPassword ? "Hide Password" : "Show Password"}
                </Text>
              </Pressable>

              <Pressable
                style={[styles.linkButton, { alignSelf: "flex-start" }]}
                onPress={forgotPassword}
              >
                <Text style={[styles.linkButtonText, { color: theme.text }]}>
                  Forgot password?
                </Text>
              </Pressable>

              <View style={styles.buttonRow}>
                <Pressable
                  style={[
                    styles.primaryButton,
                    { backgroundColor: theme.navy },
                  ]}
                  onPress={loginAccount}
                >
                  <Text
                    style={[styles.primaryButtonText, { color: theme.primary }]}
                  >
                    Log In
                  </Text>
                </Pressable>

                <Pressable
                  style={[
                    styles.outlineButton,
                    {
                      backgroundColor: theme.noticeBg,
                      borderColor: theme.primary,
                    },
                  ]}
                  onPress={() => setScreen("welcome")}
                >
                  <Text
                    style={[styles.outlineButtonText, { color: theme.text }]}
                  >
                    Back
                  </Text>
                </Pressable>
              </View>
            </View>
          </>
        )}

        {screen === "home" && (
          <>
            <View style={[styles.heroCard, { backgroundColor: theme.navy }]}>
              <Text style={[styles.michiganTop, { color: theme.primary }]}>
                MICHIGAN HEALTH AI
              </Text>
              <Text style={[styles.title, { color: theme.white }]}>
                ENT Cancer AI Safety Guide
              </Text>
              <Text style={[styles.subtitle, { color: theme.navyText }]}>
                A safer way for patients to organize questions, review AI
                answers, and prepare for real conversations with their doctors.
              </Text>
              <View
                style={[styles.maizeLine, { backgroundColor: theme.primary }]}
              />
            </View>

            {loggedInUser ? (
              <View
                style={[
                  styles.loggedInBox,
                  { backgroundColor: theme.card, borderColor: theme.border },
                ]}
              >
                <View>
                  <Text style={[styles.loggedInText, { color: theme.text }]}>
                    Hi {loggedInUser.name}
                  </Text>
                  <Text style={[styles.smallSubText, { color: theme.subtext }]}>
                    @{loggedInUser.username}
                  </Text>
                </View>
                <Pressable
                  style={[
                    styles.logoutButton,
                    {
                      backgroundColor: theme.noticeBg,
                      borderColor: theme.primary,
                    },
                  ]}
                  onPress={logoutAccount}
                >
                  <Text
                    style={[styles.logoutButtonText, { color: theme.text }]}
                  >
                    Log Out
                  </Text>
                </Pressable>
              </View>
            ) : null}

            <View
              style={[
                styles.card,
                {
                  backgroundColor: theme.card,
                  borderColor: theme.border,
                },
              ]}
            >
              <View style={styles.toggleRow}>
                <View>
                  <Text style={[styles.cardTitle, { color: theme.text }]}>
                    App settings
                  </Text>
                  <Text style={[styles.smallSubText, { color: theme.subtext }]}>
                    Toggle dark mode anytime
                  </Text>
                </View>
                <Switch value={darkMode} onValueChange={setDarkMode} />
              </View>
            </View>

            <View
              style={[
                styles.noticeBox,
                {
                  backgroundColor: theme.noticeBg,
                  borderColor: theme.noticeBorder,
                },
              ]}
            >
              <Text style={[styles.noticeTitle, { color: theme.noticeText }]}>
                Important Medical Note
              </Text>
              <Text style={[styles.noticeText, { color: theme.noticeText }]}>
                This app does not diagnose or replace your doctor. It is meant
                to help patients ask better questions and be more careful with
                AI-generated health information.
              </Text>
            </View>

            <Text style={[styles.sectionHomeTitle, { color: theme.text }]}>
              Quick start
            </Text>

            <View style={styles.grid}>
              <Pressable
                style={[
                  styles.homeCard,
                  { backgroundColor: theme.card, borderColor: theme.border },
                ]}
                onPress={() => setScreen("prompt")}
              >
                <Text style={styles.homeCardIcon}></Text>
                <Text style={[styles.homeCardTitle, { color: theme.text }]}>
                  Build Prompt
                </Text>
                <Text style={[styles.homeCardText, { color: theme.subtext }]}>
                  Create safer questions for AI.
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.homeCard,
                  { backgroundColor: theme.card, borderColor: theme.border },
                ]}
                onPress={() => setScreen("checker")}
              >
                <Text style={styles.homeCardIcon}></Text>
                <Text style={[styles.homeCardTitle, { color: theme.text }]}>
                  Check AI Answer
                </Text>
                <Text style={[styles.homeCardText, { color: theme.subtext }]}>
                  Review an AI response for red flags.
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.homeCard,
                  { backgroundColor: theme.card, borderColor: theme.border },
                ]}
                onPress={() => {
                  if (doctorQuestions.length === 0) {
                    generateDoctorQuestions();
                  }
                  setScreen("doctor");
                }}
              >
                <Text style={styles.homeCardIcon}></Text>
                <Text style={[styles.homeCardTitle, { color: theme.text }]}>
                  Doctor Questions
                </Text>
                <Text style={[styles.homeCardText, { color: theme.subtext }]}>
                  Prepare for your appointment.
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.homeCard,
                  { backgroundColor: theme.card, borderColor: theme.border },
                ]}
                onPress={() => setScreen("visit")}
              >
                <Text style={styles.homeCardIcon}></Text>
                <Text style={[styles.homeCardTitle, { color: theme.text }]}>
                  Visit Prep Notes
                </Text>
                <Text style={[styles.homeCardText, { color: theme.subtext }]}>
                  Keep symptoms, questions, and doctor notes together.
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.homeCard,
                  { backgroundColor: theme.card, borderColor: theme.border },
                ]}
                onPress={() => setScreen("sources")}
              >
                <Text style={styles.homeCardIcon}></Text>
                <Text style={[styles.homeCardTitle, { color: theme.text }]}>
                  Trusted Sources
                </Text>
                <Text style={[styles.homeCardText, { color: theme.subtext }]}>
                  Learn where to verify information.
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.homeCard,
                  { backgroundColor: theme.card, borderColor: theme.border },
                ]}
                onPress={() => setScreen("profile")}
              >
                <Text style={styles.homeCardIcon}></Text>
                <Text style={[styles.homeCardTitle, { color: theme.text }]}>
                  Profile
                </Text>
                <Text style={[styles.homeCardText, { color: theme.subtext }]}>
                  Manage your account and saved settings.
                </Text>
              </Pressable>
            </View>

            <View style={[styles.card, { backgroundColor: theme.card }]}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>
                Recent activity
              </Text>
              {recentActivity.length === 0 ? (
                <Text style={[styles.emptyState, { color: theme.subtext }]}>
                  No recent activity yet.
                </Text>
              ) : (
                recentActivity.map((item) => (
                  <View key={item.id} style={styles.activityRow}>
                    <Text style={[styles.bullet, { color: theme.primary }]}>
                      {"•"}
                    </Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.bulletText, { color: theme.text }]}>
                        {item.text}
                      </Text>
                      <Text
                        style={[styles.smallSubText, { color: theme.subtext }]}
                      >
                        {item.time}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          </>
        )}

        {screen === "profile" && (
          <>
            {renderHeader(
              "Profile",
              "Manage your account and app preferences."
            )}

            <View style={[styles.card, { backgroundColor: theme.card }]}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>
                Account
              </Text>
              {loggedInUser ? (
                <>
                  <Text style={[styles.profileLine, { color: theme.text }]}>
                    Name: {loggedInUser.name}
                  </Text>
                  <Text style={[styles.profileLine, { color: theme.text }]}>
                    Username: @{loggedInUser.username}
                  </Text>
                </>
              ) : (
                <Text style={[styles.emptyState, { color: theme.subtext }]}>
                  No active login.
                </Text>
              )}

              <View style={styles.buttonRow}>
                <Pressable
                  style={[
                    styles.primaryButton,
                    { backgroundColor: theme.navy },
                  ]}
                  onPress={logoutAccount}
                >
                  <Text
                    style={[styles.primaryButtonText, { color: theme.primary }]}
                  >
                    Log Out
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.outlineButton,
                    {
                      backgroundColor: theme.noticeBg,
                      borderColor: theme.primary,
                    },
                  ]}
                  onPress={deleteAccount}
                >
                  <Text
                    style={[styles.outlineButtonText, { color: theme.text }]}
                  >
                    Delete Account
                  </Text>
                </Pressable>
              </View>
            </View>

            <View style={[styles.card, { backgroundColor: theme.card }]}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>
                Preferences
              </Text>
              <View style={styles.toggleRow}>
                <Text style={[styles.profileLine, { color: theme.text }]}>
                  Dark mode
                </Text>
                <Switch value={darkMode} onValueChange={setDarkMode} />
              </View>
            </View>
          </>
        )}

        {screen === "prompt" && (
          <>
            {renderHeader(
              "Build a Safer Prompt",
              "Enter your details and create a better AI question."
            )}

            <View style={[styles.card, { backgroundColor: theme.card }]}>
              <Text style={[styles.label, { color: theme.text }]}>
                Cancer type
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.inputBg,
                    color: theme.inputText,
                    borderColor: theme.border,
                  },
                ]}
                placeholder="Example: laryngeal cancer"
                value={cancerType}
                onChangeText={setCancerType}
                placeholderTextColor="#7a7a7a"
              />
              <Text
                style={[styles.counterText, { color: theme.subtext }]}
              >{`${cancerType.length}/60`}</Text>

              <Text style={[styles.label, { color: theme.text }]}>
                Stage or details
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.inputBg,
                    color: theme.inputText,
                    borderColor: theme.border,
                  },
                ]}
                placeholder="Example: stage 2"
                value={stage}
                onChangeText={setStage}
                placeholderTextColor="#7a7a7a"
              />
              <Text
                style={[styles.counterText, { color: theme.subtext }]}
              >{`${stage.length}/40`}</Text>

              <Text style={[styles.label, { color: theme.text }]}>
                What do you want to understand?
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.inputBg,
                    color: theme.inputText,
                    borderColor: theme.border,
                  },
                ]}
                placeholder="Example: treatment side effects"
                value={goal}
                onChangeText={setGoal}
                placeholderTextColor="#7a7a7a"
              />
              <Text
                style={[styles.counterText, { color: theme.subtext }]}
              >{`${goal.length}/100`}</Text>

              <Pressable
                style={[styles.primaryButton, { backgroundColor: theme.navy }]}
                onPress={useCustomPrompt}
              >
                <Text
                  style={[styles.primaryButtonText, { color: theme.primary }]}
                >
                  Generate Prompt
                </Text>
              </Pressable>
            </View>

            <View style={[styles.card, { backgroundColor: theme.card }]}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>
                Quick Templates
              </Text>
              {questionTemplates.map((item) => {
                const selected = selectedTemplateId === item.id;

                return (
                  <Pressable
                    key={item.id}
                    style={[
                      styles.templateButton,
                      {
                        backgroundColor: selected ? theme.navy : theme.cardSoft,
                        borderColor: selected ? theme.navy : theme.border,
                      },
                    ]}
                    onPress={() => fillTemplate(item)}
                  >
                    <Text
                      style={[
                        styles.templateTitle,
                        { color: selected ? theme.primary : theme.text },
                      ]}
                    >
                      {item.title}
                    </Text>
                    <Text
                      style={[
                        styles.templateText,
                        { color: selected ? theme.navyText : theme.subtext },
                      ]}
                    >
                      {item.prompt}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={[styles.card, { backgroundColor: theme.card }]}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>
                Your Prompt
              </Text>
              <View
                style={[
                  styles.outputBox,
                  {
                    backgroundColor: theme.cardSoft,
                    borderColor: theme.border,
                  },
                ]}
              >
                <Text style={[styles.outputText, { color: theme.text }]}>
                  {savedPrompt || "Your prompt will appear here."}
                </Text>
              </View>

              <View style={styles.buttonRow}>
                <Pressable
                  style={[
                    styles.primaryButton,
                    { backgroundColor: theme.navy },
                  ]}
                  onPress={sharePrompt}
                >
                  <Text
                    style={[styles.primaryButtonText, { color: theme.primary }]}
                  >
                    Share Prompt
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.outlineButton,
                    {
                      backgroundColor: theme.noticeBg,
                      borderColor: theme.primary,
                    },
                  ]}
                  onPress={copyPrompt}
                >
                  <Text
                    style={[styles.outlineButtonText, { color: theme.text }]}
                  >
                    Copy Prompt
                  </Text>
                </Pressable>
              </View>

              <View style={styles.buttonRow}>
                <Pressable
                  style={[
                    styles.primaryButton,
                    { backgroundColor: theme.navy },
                  ]}
                  onPress={saveFavoritePrompt}
                >
                  <Text
                    style={[styles.primaryButtonText, { color: theme.primary }]}
                  >
                    Save Favorite
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.outlineButton,
                    {
                      backgroundColor: theme.noticeBg,
                      borderColor: theme.primary,
                    },
                  ]}
                  onPress={() => setScreen("favorites")}
                >
                  <Text
                    style={[styles.outlineButtonText, { color: theme.text }]}
                  >
                    View Favorites
                  </Text>
                </Pressable>
              </View>

              <View style={styles.singleButtonWrap}>
                <Pressable
                  style={[
                    styles.softButton,
                    {
                      backgroundColor: theme.cardSoft,
                      borderColor: theme.border,
                    },
                  ]}
                  onPress={clearAll}
                >
                  <Text style={[styles.softButtonText, { color: theme.text }]}>
                    Clear All Saved Data
                  </Text>
                </Pressable>
              </View>
            </View>
          </>
        )}

        {screen === "favorites" && (
          <>
            {renderHeader("Favorite Prompts", "Reuse saved prompts anytime.")}

            <View style={[styles.card, { backgroundColor: theme.card }]}>
              {favoritePrompts.length === 0 ? (
                <Text style={[styles.emptyState, { color: theme.subtext }]}>
                  No favorite prompts yet.
                </Text>
              ) : (
                favoritePrompts.map((item) => (
                  <View
                    key={item.id}
                    style={[
                      styles.favoriteBox,
                      {
                        backgroundColor: theme.cardSoft,
                        borderColor: theme.border,
                      },
                    ]}
                  >
                    <Text style={[styles.outputText, { color: theme.text }]}>
                      {item.text}
                    </Text>
                    <View style={styles.buttonRow}>
                      <Pressable
                        style={[
                          styles.primaryButton,
                          { backgroundColor: theme.navy },
                        ]}
                        onPress={() => useFavoritePrompt(item)}
                      >
                        <Text
                          style={[
                            styles.primaryButtonText,
                            { color: theme.primary },
                          ]}
                        >
                          Use
                        </Text>
                      </Pressable>
                      <Pressable
                        style={[
                          styles.outlineButton,
                          {
                            backgroundColor: theme.noticeBg,
                            borderColor: theme.primary,
                          },
                        ]}
                        onPress={() => deleteFavoritePrompt(item.id)}
                      >
                        <Text
                          style={[
                            styles.outlineButtonText,
                            { color: theme.text },
                          ]}
                        >
                          Delete
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                ))
              )}
            </View>
          </>
        )}

        {screen === "checker" && (
          <>
            {renderHeader(
              "Check an AI Answer",
              "Paste a response and look for possible safety concerns."
            )}

            <View style={[styles.card, { backgroundColor: theme.card }]}>
              <View style={styles.cardHeaderRow}>
                <Text style={[styles.cardTitle, { color: theme.text }]}>
                  AI Answer Review
                </Text>
                <View
                  style={[
                    styles.riskBadge,
                    { backgroundColor: riskLevel.color },
                  ]}
                >
                  <Text style={styles.riskBadgeText}>{riskLevel.label}</Text>
                </View>
              </View>

              <View
                style={[
                  styles.riskBar,
                  { backgroundColor: theme.border, overflow: "hidden" },
                ]}
              >
                <View
                  style={{
                    width: `${riskLevel.score}%`,
                    backgroundColor: riskBarColor,
                    height: "100%",
                  }}
                />
              </View>

              <TextInput
                style={[
                  styles.largeInput,
                  {
                    backgroundColor: theme.inputBg,
                    color: theme.inputText,
                    borderColor: theme.border,
                  },
                ]}
                multiline
                placeholder="Paste the AI answer here"
                value={aiAnswer}
                onChangeText={setAiAnswer}
                placeholderTextColor="#7a7a7a"
              />
              <Text
                style={[styles.counterText, { color: theme.subtext }]}
              >{`${aiAnswer.length} characters`}</Text>

              <View style={styles.buttonRow}>
                <Pressable
                  style={[
                    styles.primaryButton,
                    { backgroundColor: theme.navy },
                  ]}
                  onPress={loadExampleAnswer}
                >
                  <Text
                    style={[styles.primaryButtonText, { color: theme.primary }]}
                  >
                    Load Example
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.outlineButton,
                    {
                      backgroundColor: theme.noticeBg,
                      borderColor: theme.primary,
                    },
                  ]}
                  onPress={() => setAiAnswer("")}
                >
                  <Text
                    style={[styles.outlineButtonText, { color: theme.text }]}
                  >
                    Clear
                  </Text>
                </Pressable>
              </View>

              {aiAnswer.trim() ? (
                <View
                  style={[
                    styles.summaryBox,
                    {
                      backgroundColor: theme.cardSoft,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  <Text style={[styles.summaryTitle, { color: theme.text }]}>
                    Safety Score: {riskLevel.score}/100
                  </Text>
                  <Text style={[styles.summaryText, { color: theme.subtext }]}>
                    {riskLevel.summary}
                  </Text>

                  <Text
                    style={[styles.summaryMiniTitle, { color: theme.text }]}
                  >
                    Next safe step
                  </Text>
                  <Text style={[styles.summaryText, { color: theme.subtext }]}>
                    {riskLevel.nextStep}
                  </Text>
                </View>
              ) : null}

              <Text style={[styles.sectionTitle, { color: theme.text }]}>
                What sounds okay
              </Text>
              {safetyReview.positives.length === 0 ? (
                <Text style={[styles.emptyState, { color: theme.subtext }]}>
                  Nothing notable yet.
                </Text>
              ) : (
                safetyReview.positives.map((item, index) => (
                  <View key={`positive-${index}`} style={styles.bulletRow}>
                    <Text style={[styles.goodBullet, { color: theme.green }]}>
                      {"✓"}
                    </Text>
                    <Text style={[styles.bulletText, { color: theme.text }]}>
                      {item}
                    </Text>
                  </View>
                ))
              )}

              <Text style={[styles.sectionTitle, { color: theme.text }]}>
                Possible safety concerns
              </Text>
              {safetyReview.checks.length === 0 ? (
                <Text style={[styles.emptyState, { color: theme.subtext }]}>
                  Paste an AI answer to review it.
                </Text>
              ) : (
                safetyReview.checks.map((item, index) => (
                  <View key={`check-${index}`} style={styles.bulletRow}>
                    <Text style={[styles.bullet, { color: theme.primary }]}>
                      {"•"}
                    </Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.bulletText, { color: theme.text }]}>
                        {item}
                      </Text>
                      <Text
                        style={[styles.smallSubText, { color: theme.subtext }]}
                      >
                        Why this was flagged: this kind of wording may be too
                        broad, too certain, or missing medical context.
                      </Text>
                    </View>
                  </View>
                ))
              )}

              <Text style={[styles.sectionTitle, { color: theme.text }]}>
                What may be missing
              </Text>
              {safetyReview.missing.length === 0 ? (
                <Text style={[styles.emptyState, { color: theme.subtext }]}>
                  No missing items flagged.
                </Text>
              ) : (
                safetyReview.missing.map((item, index) => (
                  <View key={`missing-${index}`} style={styles.bulletRow}>
                    <Text style={[styles.warnBullet, { color: theme.yellow }]}>
                      {"•"}
                    </Text>
                    <Text style={[styles.bulletText, { color: theme.text }]}>
                      {item}
                    </Text>
                  </View>
                ))
              )}

              <Text style={[styles.sectionTitle, { color: theme.text }]}>
                What to verify with your doctor
              </Text>
              {safetyReview.verify.length === 0 ? (
                <Text style={[styles.emptyState, { color: theme.subtext }]}>
                  Nothing to verify yet.
                </Text>
              ) : (
                safetyReview.verify.map((item, index) => (
                  <View key={`verify-${index}`} style={styles.bulletRow}>
                    <Text style={[styles.verifyBullet, { color: theme.text }]}>
                      {"•"}
                    </Text>
                    <Text style={[styles.bulletText, { color: theme.text }]}>
                      {item}
                    </Text>
                  </View>
                ))
              )}

              {aiAnswer.trim() ? (
                <>
                  <Text style={[styles.sectionTitle, { color: theme.text }]}>
                    Suggested safer rewrite
                  </Text>
                  <View
                    style={[
                      styles.summaryBox,
                      {
                        backgroundColor: theme.cardSoft,
                        borderColor: theme.border,
                      },
                    ]}
                  >
                    <Text
                      style={[styles.summaryText, { color: theme.subtext }]}
                    >
                      {getSaferRewrite()}
                    </Text>
                  </View>

                  <Text style={[styles.sectionTitle, { color: theme.text }]}>
                    Appointment prep questions
                  </Text>
                  <View style={styles.bulletRow}>
                    <Text style={[styles.bullet, { color: theme.primary }]}>
                      {"•"}
                    </Text>
                    <Text style={[styles.bulletText, { color: theme.text }]}>
                      Does this advice change based on my exact diagnosis and
                      stage?
                    </Text>
                  </View>
                  <View style={styles.bulletRow}>
                    <Text style={[styles.bullet, { color: theme.primary }]}>
                      {"•"}
                    </Text>
                    <Text style={[styles.bulletText, { color: theme.text }]}>
                      What side effects or warning symptoms should I watch for?
                    </Text>
                  </View>
                  <View style={styles.bulletRow}>
                    <Text style={[styles.bullet, { color: theme.primary }]}>
                      {"•"}
                    </Text>
                    <Text style={[styles.bulletText, { color: theme.text }]}>
                      Which parts of this AI answer are correct for my case?
                    </Text>
                  </View>
                </>
              ) : null}

              <View
                style={[
                  styles.urgentNote,
                  {
                    backgroundColor: theme.noticeBg,
                    borderColor: theme.noticeBorder,
                  },
                ]}
              >
                <Text style={[styles.urgentTitle, { color: theme.noticeText }]}>
                  Urgent symptoms note
                </Text>
                <Text style={[styles.urgentText, { color: theme.noticeText }]}>
                  For urgent or severe symptoms, contact your doctor or local
                  emergency services right away.
                </Text>
              </View>
            </View>
          </>
        )}

        {screen === "doctor" && (
          <>
            {renderHeader(
              "Questions for Your Doctor",
              "Bring these to your next appointment."
            )}

            <View style={[styles.card, { backgroundColor: theme.card }]}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>
                Suggested Questions
              </Text>

              {doctorQuestions.length === 0 ? (
                <Text style={[styles.emptyState, { color: theme.subtext }]}>
                  Add your cancer details first on the Prompt page for more
                  personalized questions.
                </Text>
              ) : (
                doctorQuestions.map((question, index) => (
                  <View
                    key={question.id}
                    style={[
                      styles.editQuestionCard,
                      {
                        backgroundColor: theme.cardSoft,
                        borderColor: theme.border,
                        opacity: question.asked ? 0.75 : 1,
                      },
                    ]}
                  >
                    <View style={styles.questionNumberWrap}>
                      <Text
                        style={[
                          styles.questionNumber,
                          {
                            backgroundColor: theme.navy,
                            color: theme.primary,
                            textDecorationLine: question.asked
                              ? "line-through"
                              : "none",
                          },
                        ]}
                      >
                        {index + 1}
                      </Text>
                    </View>

                    <View style={{ flex: 1 }}>
                      <TextInput
                        style={[
                          styles.questionInput,
                          {
                            color: theme.text,
                            backgroundColor: theme.card,
                            borderColor: theme.border,
                            textDecorationLine: question.asked
                              ? "line-through"
                              : "none",
                          },
                        ]}
                        value={question.text}
                        onChangeText={(text) =>
                          updateDoctorQuestion(text, index)
                        }
                        multiline
                        placeholder="Edit this question"
                        placeholderTextColor="#7a7a7a"
                      />

                      <View style={styles.actionWrap}>
                        <Pressable
                          style={[
                            styles.miniControl,
                            {
                              borderColor: theme.border,
                              backgroundColor: theme.card,
                            },
                          ]}
                          onPress={() => toggleAskedQuestion(index)}
                        >
                          <Text
                            style={[
                              styles.miniControlText,
                              { color: theme.text },
                            ]}
                          >
                            {question.asked ? "Unmark" : "Mark Asked"}
                          </Text>
                        </Pressable>

                        <Pressable
                          style={[
                            styles.miniControl,
                            {
                              borderColor: theme.border,
                              backgroundColor: theme.card,
                            },
                          ]}
                          onPress={() => moveDoctorQuestionUp(index)}
                        >
                          <Text
                            style={[
                              styles.miniControlText,
                              { color: theme.text },
                            ]}
                          >
                            {"^"}
                          </Text>
                        </Pressable>

                        <Pressable
                          style={[
                            styles.miniControl,
                            {
                              borderColor: theme.border,
                              backgroundColor: theme.card,
                            },
                          ]}
                          onPress={() => moveDoctorQuestionDown(index)}
                        >
                          <Text
                            style={[
                              styles.miniControlText,
                              { color: theme.text },
                            ]}
                          >
                            {"v"}
                          </Text>
                        </Pressable>

                        <Pressable
                          style={[
                            styles.miniControl,
                            {
                              borderColor: theme.border,
                              backgroundColor: theme.card,
                            },
                          ]}
                          onPress={() => deleteDoctorQuestion(index)}
                        >
                          <Text
                            style={[
                              styles.miniControlText,
                              { color: theme.text },
                            ]}
                          >
                            Delete
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  </View>
                ))
              )}

              <View style={styles.buttonRow}>
                <Pressable
                  style={[
                    styles.primaryButton,
                    { backgroundColor: theme.navy },
                  ]}
                  onPress={generateDoctorQuestions}
                >
                  <Text
                    style={[styles.primaryButtonText, { color: theme.primary }]}
                  >
                    Refresh Questions
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.outlineButton,
                    {
                      backgroundColor: theme.noticeBg,
                      borderColor: theme.primary,
                    },
                  ]}
                  onPress={copyDoctorQuestions}
                >
                  <Text
                    style={[styles.outlineButtonText, { color: theme.text }]}
                  >
                    Copy Questions
                  </Text>
                </Pressable>
              </View>

              <View style={styles.singleButtonWrap}>
                <Pressable
                  style={[
                    styles.softButton,
                    {
                      backgroundColor: theme.cardSoft,
                      borderColor: theme.border,
                    },
                  ]}
                  onPress={addDoctorQuestion}
                >
                  <Text style={[styles.softButtonText, { color: theme.text }]}>
                    Add Your Own Question
                  </Text>
                </Pressable>
              </View>
            </View>
          </>
        )}

        {screen === "visit" && (
          <>
            {renderHeader(
              "Visit Prep Notes",
              "Keep symptoms, questions, and doctor answers together."
            )}

            <View style={[styles.card, { backgroundColor: theme.card }]}>
              <Text style={[styles.label, { color: theme.text }]}>
                Symptoms / concerns
              </Text>
              <TextInput
                style={[
                  styles.largeInput,
                  {
                    backgroundColor: theme.inputBg,
                    color: theme.inputText,
                    borderColor: theme.border,
                  },
                ]}
                multiline
                value={visitSymptoms}
                onChangeText={setVisitSymptoms}
                placeholder="Write symptoms, concerns, or what has changed..."
                placeholderTextColor="#7a7a7a"
              />
              <Text
                style={[styles.counterText, { color: theme.subtext }]}
              >{`${visitSymptoms.length} characters`}</Text>

              <Text style={[styles.label, { color: theme.text }]}>
                Questions for the visit
              </Text>
              <TextInput
                style={[
                  styles.largeInput,
                  {
                    backgroundColor: theme.inputBg,
                    color: theme.inputText,
                    borderColor: theme.border,
                  },
                ]}
                multiline
                value={visitQuestions}
                onChangeText={setVisitQuestions}
                placeholder="Write questions you want to ask..."
                placeholderTextColor="#7a7a7a"
              />
              <Text
                style={[styles.counterText, { color: theme.subtext }]}
              >{`${visitQuestions.length} characters`}</Text>

              <Text style={[styles.label, { color: theme.text }]}>
                Doctor answers / notes
              </Text>
              <TextInput
                style={[
                  styles.largeInput,
                  {
                    backgroundColor: theme.inputBg,
                    color: theme.inputText,
                    borderColor: theme.border,
                  },
                ]}
                multiline
                value={visitDoctorAnswers}
                onChangeText={setVisitDoctorAnswers}
                placeholder="Write down what the doctor says..."
                placeholderTextColor="#7a7a7a"
              />
              <Text
                style={[styles.counterText, { color: theme.subtext }]}
              >{`${visitDoctorAnswers.length} characters`}</Text>

              <View style={styles.buttonRow}>
                <Pressable
                  style={[
                    styles.primaryButton,
                    { backgroundColor: theme.navy },
                  ]}
                  onPress={copyVisitPrep}
                >
                  <Text
                    style={[styles.primaryButtonText, { color: theme.primary }]}
                  >
                    Copy Notes
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.outlineButton,
                    {
                      backgroundColor: theme.noticeBg,
                      borderColor: theme.primary,
                    },
                  ]}
                  onPress={shareVisitPrep}
                >
                  <Text
                    style={[styles.outlineButtonText, { color: theme.text }]}
                  >
                    Export / Share
                  </Text>
                </Pressable>
              </View>
            </View>
          </>
        )}

        {screen === "sources" && (
          <>
            {renderHeader(
              "Trusted Sources",
              "Good places to double-check AI information."
            )}

            <View style={[styles.card, { backgroundColor: theme.card }]}>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.inputBg,
                    color: theme.inputText,
                    borderColor: theme.border,
                  },
                ]}
                placeholder="Search sources"
                value={sourceSearch}
                onChangeText={setSourceSearch}
                placeholderTextColor="#7a7a7a"
              />

              {filteredSources.length === 0 ? (
                <Text style={[styles.emptyState, { color: theme.subtext }]}>
                  No matching sources found.
                </Text>
              ) : (
                filteredSources.map((source) => (
                  <View
                    key={source.id}
                    style={[
                      styles.sourceBox,
                      { backgroundColor: theme.cardSoft },
                    ]}
                  >
                    <Text style={[styles.sourceName, { color: theme.text }]}>
                      {source.name}
                    </Text>
                    <Text
                      style={[styles.sourceReason, { color: theme.subtext }]}
                    >
                      {source.reason}
                    </Text>
                    <Pressable
                      style={[
                        styles.sourceButton,
                        { backgroundColor: theme.primary },
                      ]}
                      onPress={() => showSourceTip(source)}
                    >
                      <Text
                        style={[styles.sourceButtonText, { color: theme.navy }]}
                      >
                        Why use this source?
                      </Text>
                    </Pressable>
                  </View>
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    padding: 18,
    paddingBottom: 40,
  },

  heroCard: {
    borderRadius: 28,
    padding: 24,
    marginBottom: 18,
  },
  michiganTop: {
    fontWeight: "900",
    fontSize: 13,
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  title: {
    fontSize: 30,
    fontWeight: "900",
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 23,
    marginBottom: 16,
  },
  maizeLine: {
    height: 5,
    width: 90,
    borderRadius: 999,
  },

  noticeBox: {
    borderRadius: 20,
    padding: 16,
    marginBottom: 18,
    borderWidth: 1,
  },
  noticeTitle: {
    fontSize: 17,
    fontWeight: "800",
    marginBottom: 6,
  },
  noticeText: {
    fontSize: 14,
    lineHeight: 21,
  },

  sectionHomeTitle: {
    fontSize: 22,
    fontWeight: "900",
    marginBottom: 14,
  },

  grid: {
    gap: 14,
  },
  homeCard: {
    borderRadius: 24,
    padding: 20,
    borderWidth: 2,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  homeCardIcon: {
    fontSize: 28,
    marginBottom: 10,
  },
  homeCardTitle: {
    fontSize: 20,
    fontWeight: "900",
    marginBottom: 6,
  },
  homeCardText: {
    fontSize: 14,
    lineHeight: 21,
  },

  topHeader: {
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
  },
  topHeaderTitle: {
    fontSize: 26,
    fontWeight: "900",
    marginBottom: 6,
  },
  topHeaderSubtitle: {
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 14,
  },
  backButton: {
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
  },
  backButtonText: {
    fontWeight: "900",
    fontSize: 14,
  },

  card: {
    borderRadius: 24,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: "900",
    marginBottom: 12,
  },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },

  label: {
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 6,
    marginTop: 6,
  },
  input: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 4,
    borderWidth: 1,
  },
  largeInput: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    minHeight: 160,
    textAlignVertical: "top",
    marginBottom: 4,
    borderWidth: 1,
  },
  counterText: {
    fontSize: 12,
    marginBottom: 8,
    alignSelf: "flex-end",
  },

  buttonRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
  },
  singleButtonWrap: {
    marginTop: 10,
  },
  primaryButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
    marginTop: 10,
  },
  primaryButtonText: {
    fontWeight: "900",
    fontSize: 15,
  },
  outlineButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
    borderWidth: 1,
    marginTop: 10,
  },
  outlineButtonText: {
    fontWeight: "900",
    fontSize: 15,
  },
  softButton: {
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
    borderWidth: 1,
  },
  softButtonText: {
    fontWeight: "800",
    fontSize: 14,
  },

  smallActionButton: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 4,
  },
  smallActionText: {
    fontWeight: "800",
    fontSize: 13,
  },
  linkButton: {
    marginTop: 8,
  },
  linkButtonText: {
    fontSize: 13,
    fontWeight: "800",
  },

  templateButton: {
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
  },
  templateTitle: {
    fontSize: 15,
    fontWeight: "900",
    marginBottom: 4,
  },
  templateText: {
    fontSize: 13,
    lineHeight: 19,
  },

  outputBox: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    minHeight: 100,
  },
  outputText: {
    fontSize: 15,
    lineHeight: 22,
  },

  summaryBox: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    marginTop: 10,
    marginBottom: 6,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: "900",
    marginBottom: 6,
  },
  summaryMiniTitle: {
    fontSize: 14,
    fontWeight: "800",
    marginTop: 8,
    marginBottom: 4,
  },
  summaryText: {
    fontSize: 14,
    lineHeight: 21,
  },

  riskBar: {
    height: 10,
    borderRadius: 999,
    marginBottom: 12,
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: "900",
    marginBottom: 8,
    marginTop: 14,
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 8,
    paddingRight: 6,
  },
  bullet: {
    fontSize: 18,
    marginRight: 8,
    lineHeight: 22,
  },
  goodBullet: {
    fontSize: 16,
    marginRight: 8,
    lineHeight: 22,
    fontWeight: "900",
  },
  warnBullet: {
    fontSize: 18,
    marginRight: 8,
    lineHeight: 22,
  },
  verifyBullet: {
    fontSize: 18,
    marginRight: 8,
    lineHeight: 22,
  },
  bulletText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 21,
  },

  urgentNote: {
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    marginTop: 14,
  },
  urgentTitle: {
    fontSize: 14,
    fontWeight: "900",
    marginBottom: 4,
  },
  urgentText: {
    fontSize: 13,
    lineHeight: 20,
  },

  sourceBox: {
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
  },
  sourceName: {
    fontSize: 15,
    fontWeight: "900",
  },
  sourceReason: {
    fontSize: 13,
    marginTop: 3,
    marginBottom: 10,
  },
  sourceButton: {
    alignSelf: "flex-start",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  sourceButtonText: {
    fontWeight: "900",
    fontSize: 13,
  },

  emptyState: {
    fontSize: 14,
    lineHeight: 20,
  },

  riskBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  riskBadgeText: {
    color: "white",
    fontSize: 12,
    fontWeight: "900",
  },

  editQuestionCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
  },
  questionNumberWrap: {
    marginRight: 10,
    paddingTop: 2,
  },
  questionNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    textAlign: "center",
    lineHeight: 28,
    fontWeight: "900",
    overflow: "hidden",
  },
  questionInput: {
    fontSize: 14,
    lineHeight: 21,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 52,
    textAlignVertical: "top",
  },

  actionWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  miniControl: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  miniControlText: {
    fontSize: 12,
    fontWeight: "800",
  },

  favoriteBox: {
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    marginBottom: 10,
  },

  loggedInBox: {
    borderRadius: 18,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  loggedInText: {
    fontSize: 15,
    fontWeight: "800",
  },
  logoutButton: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  logoutButtonText: {
    fontWeight: "900",
    fontSize: 13,
  },

  smallSubText: {
    fontSize: 12,
    marginTop: 2,
  },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  activityRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  profileLine: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 6,
  },
});
