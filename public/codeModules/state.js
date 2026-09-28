export const state = {
    user : null,
    firebaseUser : null,
    permissions : null,
    myFeatures = [],
    currentSelectedSidebar = null,
    ss_TOOLS = new Map(),
    ss_CHATS = new Map(),
    ss_CAMPAIGNS = new Map(),
    activeChat = null,
    activeFeature = null,
    activeFeatureType = null,
    userManifest = null,
  //  guestManifest = null,
    activeCampaignAdminId = null,
    conversationListeners = new Map(),
    chatRenderGeneration = 0
};

