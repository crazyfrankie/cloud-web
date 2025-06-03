import { createStore } from 'vuex'
import config from '@/config'

// 定义类型
interface User {
  id: string;
  nickname: string;
  avatar: string;
  birthday?: string;
  createTime?: string;
}

interface FolderItem {
  id: number;
  name: string;
  path: string;
}

interface State {
  user: User | null;
  currentPath: string;
  folderStack: FolderItem[];
}

export default createStore<State>({
  state: {
    user: null,
    currentPath: '/', // 当前路径，根目录为 '/'
    folderStack: [], // 导航历史栈，存储 {id, name, path} 对象
  },
  getters: {
    isAuthenticated: state => !!state.user,
    userNickname: state => state.user ? state.user.nickname : '',
    userAvatar: state => state.user ? state.user.avatar : config.defaultAvatar,
  },
  mutations: {
    setUser(state, user) {
      state.user = user;
    },
    clearUser(state) {
      state.user = null;
    },
    setCurrentPath(state, path) {
      state.currentPath = path;
    },
    pushToFolderStack(state, folder) {
      state.folderStack.push(folder);
    },
    popFolderStack(state) {
      return state.folderStack.pop();
    },
    resetFolderStack(state) {
      state.folderStack = [];
      state.currentPath = '/';
    }
  },
  actions: {
    async login({ commit }, credentials) {
      // 登录逻辑将在组件中处理
    },
    async logout({ commit }) {
      commit('clearUser');
      commit('resetFolderStack');
    },
    navigateToFolder({ commit }, folder) {
      commit('setCurrentPath', folder.path);
      commit('pushToFolderStack', folder);
    },
    navigateBack({ commit, state }) {
      if (state.folderStack.length > 0) {
        commit('popFolderStack');
        const previousFolder = state.folderStack.length > 0 
          ? state.folderStack[state.folderStack.length - 1] 
          : { name: 'root', path: '/' };
        commit('setCurrentPath', previousFolder.path);
      }
    }
  },
  modules: {
  }
})
