<template>
  <div class="comment-section">
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-lg font-bold text-gray-800 dark:text-white">
        <i class="fa-solid fa-comments mr-2"></i>留言 ({{ comments.length }})
      </h3>
      <div v-if="comments.length > 0" class="flex items-center gap-2 text-sm">
        <span class="text-gray-500 dark:text-gray-400">排序：</span>
        <select v-model="sortBy" class="px-2 py-1 text-sm bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-gray-700 dark:text-gray-300 cursor-pointer">
          <option value="time-asc">由舊到新</option>
          <option value="time-desc">由新到舊</option>
          <option value="reactions">表情回饋</option>
        </select>
      </div>
    </div>
    
    <!-- Comment Input Form -->
    <div v-if="currentUser" class="mb-4">
      <div class="flex items-start space-x-3">
        <!-- User Avatar -->
        <div class="w-8 h-8 rounded-full mt-1 flex items-center justify-center shrink-0 overflow-hidden bg-blue-600 text-white text-sm">
          <img v-if="currentUser.avatar" :src="currentUser.avatar" class="w-full h-full object-cover" alt="">
          <span v-else>{{ currentUser.username?.charAt(0).toUpperCase() || '?' }}</span>
        </div>
        <div class="flex-1">
          <!-- Markdown Toolbar - only show when focused or has content -->
          <MarkdownToolbar 
            v-if="commentTextareaFocused || newComment.trim()"
            :textareaRef="commentTextarea" 
            v-model="newComment" 
          />
      <!-- Textarea for editing -->
      <textarea v-show="!commentPreviewMode" v-model="newComment" 
          placeholder="寫下你的留言..."
          ref="commentTextarea"
          @focus="commentTextareaFocused = true"
          @blur="handleCommentBlur"
          @input="autoGrowCommentTextarea"
          :class="(commentTextareaFocused || newComment.trim()) && !commentPreviewMode ? 'rounded-b-lg' : 'rounded-lg'"
          class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none transition-all"
          :rows="commentTextareaFocused || newComment.trim() ? 3 : 1"
          :style="{ maxHeight: '192px', overflow: 'auto' }"></textarea>
      <!-- Preview area -->
      <div v-if="commentPreviewMode && newComment.trim()" 
          class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-b-lg bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 overflow-auto markdown-body comment-body"
          style="min-height: 76px; max-height: 192px;"
          v-html="renderCommentMarkdown(newComment)"></div>
      <div v-if="commentPreviewMode && !newComment.trim()" 
          class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-b-lg bg-gray-50 dark:bg-gray-900 text-gray-400 dark:text-gray-500 italic"
          style="min-height: 76px;">
          沒有內容可預覽
      </div>
      <div v-show="commentTextareaFocused || newComment.trim()" class="flex justify-between items-center mt-1">
        <div class="text-xs text-gray-400"><span>支援 Markdown 語法</span></div>
        <div class="flex gap-2">
          <button @click="commentPreviewMode = !commentPreviewMode"
              :class="commentPreviewMode ? 'bg-gray-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'"
              class="px-2 py-1 text-sm rounded hover:opacity-80">
            {{ commentPreviewMode ? '編輯' : '預覽' }}
          </button>
          <button @click="submitComment" :disabled="submittingComment || !newComment.trim()"
              class="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
            {{ submittingComment ? '發送中...' : '發送' }}
          </button>
        </div>
        </div>
        </div>
      </div>
    </div>
    <div v-else class="text-center text-gray-500 dark:text-gray-400 py-4 bg-gray-100 dark:bg-gray-800 rounded-lg mb-4">
      <i class="fa-solid fa-sign-in-alt mr-2"></i>請先登入才能留言
    </div>
    
    <!-- Comments List -->
    <div class="space-y-4">
      <template v-for="comment in topLevelComments" :key="comment.id">
        <div class="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <!-- Comment Header -->
          <div class="flex items-start justify-between mb-2">
            <div class="flex items-center gap-2">
              <!-- Avatar and Name with Tooltip -->
              <div class="flex items-center gap-2 relative group">
                <div class="w-8 h-8 rounded-full flex items-center justify-center overflow-hidden text-white cursor-pointer"
                     :class="comment.user ? 'bg-blue-600' : 'bg-gray-500'">
                  <img v-if="comment.user?.avatar" :src="comment.user.avatar" class="w-full h-full object-cover" alt="">
                  <span v-else>{{ comment.user?.username?.charAt(0).toUpperCase() || '?' }}</span>
                </div>
                <span class="font-medium text-gray-800 dark:text-white text-sm cursor-pointer">{{ comment.user?.name || comment.user?.username || '匿名' }}</span>
                <!-- User Info Tooltip -->
                <div v-if="comment.user" class="absolute left-0 top-full pt-2 hidden group-hover:block z-50">
                  <div class="bg-gray-200 dark:bg-gray-800 rounded-lg shadow-xl border border-gray-300 dark:border-gray-700" style="min-width: 200px;">
                    <!-- Arrow -->
                    <div class="absolute top-0 left-4 w-3 h-3 bg-gray-200 dark:bg-gray-800 border-t border-l border-gray-300 dark:border-gray-700 transform rotate-45"></div>
                    <div class="relative z-10 p-3">
                      <div class="flex items-center space-x-3 mb-2">
                        <div class="w-10 h-10 rounded-full flex items-center justify-center overflow-hidden text-white text-sm"
                             :class="comment.user.avatar ? '' : 'bg-blue-600'">
                          <img v-if="comment.user.avatar" :src="comment.user.avatar" class="w-full h-full object-cover" alt="">
                          <span v-else>{{ comment.user.username?.charAt(0).toUpperCase() || '?' }}</span>
                        </div>
                        <div class="flex-1 min-w-0">
                          <div class="font-medium text-gray-800 dark:text-white text-sm truncate">
                            {{ comment.user.name || comment.user.username }}
                          </div>
                          <div class="text-xs text-gray-500 dark:text-gray-400 truncate">
                            @{{ comment.user.username }}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <!-- Time (outside group to avoid tooltip) -->
              <span class="text-xs text-gray-400 cursor-help" :title="formatFullTime(comment.createdAt)">{{ formatCommentTime(comment.createdAt) }}</span>
            </div>
            <!-- Dropdown Menu -->
            <div v-if="canEditComment(comment) || canDeleteComment(comment)" class="relative">
              <button @click.stop="toggleCommentMenu(comment.id)" data-comment-menu class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                <i class="fa-solid fa-ellipsis-vertical"></i>
              </button>
              <div v-if="openMenuId === comment.id" 
                   class="comment-menu-dropdown absolute right-0 top-full mt-1 w-32 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-50">
                <button v-if="canEditComment(comment)" @click="startEditComment(comment)" class="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600 flex items-center">
                  <i class="fa-solid fa-pen mr-2"></i>編輯
                </button>
                <button v-if="canDeleteComment(comment)" @click="deleteComment(comment.id)" class="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-gray-100 dark:hover:bg-gray-600 flex items-center">
                  <i class="fa-solid fa-trash mr-2"></i>刪除
                </button>
              </div>
            </div>
          </div>
          
          <!-- Comment Content - Edit Mode -->
          <div v-if="editingCommentId === comment.id" class="mb-3">
            <!-- Edit Markdown Toolbar -->
            <MarkdownToolbar 
              :textareaRef="editTextarea" 
              v-model="editCommentContent" 
            />
            <textarea v-model="editCommentContent" 
                ref="editTextarea"
                class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-b-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none transition-all"
                rows="3"></textarea>
            <div class="flex justify-between items-center mt-1">
              <div class="text-xs text-gray-400">支援 Markdown 語法</div>
              <div class="flex gap-2">
                <button @click="cancelEditComment" class="px-3 py-1.5 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:opacity-80">取消</button>
                <button @click="updateComment(comment.id)" class="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">儲存</button>
              </div>
            </div>
          </div>
          <!-- Comment Content - View Mode -->
          <div v-else class="text-gray-700 dark:text-gray-300 text-sm mb-3 markdown-body comment-body" style="background-color: transparent;" v-html="renderCommentMarkdown(comment.content)"></div>
          
          <!-- Reactions Display -->
          <div v-if="Object.keys(comment.reactionCounts || {}).length > 0" class="flex items-center gap-2 mt-2 flex-wrap">
            <span v-for="(count, type) in comment.reactionCounts" :key="type"
                  @click="toggleReaction(comment.id, type)"
                  class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs cursor-pointer transition"
                  :class="comment.userReaction === type 
                    ? 'bg-blue-100 dark:bg-blue-900 border border-blue-300 dark:border-blue-700' 
                    : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600'">
              <i :class="getReactionIcon(type)"></i>
              <span>{{ count }}</span>
            </span>
          </div>
          
          <!-- Action Buttons -->
          <div class="flex items-center gap-3 mt-2">
            <!-- Like Button with Reaction Picker -->
            <div class="relative group/reaction">
              <button @click="toggleReaction(comment.id, 'like')" class="text-xs text-gray-400 hover:text-blue-500 transition flex items-center gap-1 pb-2 -mb-2"
                      :class="comment.userReaction != null ? 'text-blue-500' : ''">
                <i :class="comment.userReaction != null ? 'fa-solid fa-thumbs-up' : 'fa-regular fa-thumbs-up'"></i>
                <span>讚</span>
              </button>
              <!-- Reaction Picker Tooltip -->
              <div class="absolute -left-4 bottom-full hidden group-hover/reaction:block z-50 pb-1">
                <div class="bg-white dark:bg-gray-800 rounded-full shadow-lg border border-gray-200 dark:border-gray-700 px-1 py-1 flex items-center gap-1">
                  <button @click.stop="toggleReaction(comment.id, 'like')" 
                          class="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition text-lg"
                          :class="comment.userReaction === 'like' ? 'bg-blue-100 dark:bg-blue-900' : ''"
                          title="讚">
                    <i class="fa-solid fa-thumbs-up text-blue-500"></i>
                  </button>
                  <button @click.stop="toggleReaction(comment.id, 'ok')" 
                          class="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition text-lg"
                          :class="comment.userReaction === 'ok' ? 'bg-green-100 dark:bg-green-900' : ''"
                          title="OK">
                    <i class="fa-solid fa-circle-check text-green-500"></i>
                  </button>
                  <button @click.stop="toggleReaction(comment.id, 'laugh')" 
                          class="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition text-lg"
                          :class="comment.userReaction === 'laugh' ? 'bg-yellow-100 dark:bg-yellow-900' : ''"
                          title="哈哈">
                    <i class="fa-solid fa-face-laugh-squint text-yellow-500"></i>
                  </button>
                  <button @click.stop="toggleReaction(comment.id, 'surprise')" 
                          class="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition text-lg"
                          :class="comment.userReaction === 'surprise' ? 'bg-amber-100 dark:bg-amber-900' : ''"
                          title="驚訝">
                    <i class="fa-solid fa-face-surprise text-amber-500"></i>
                  </button>
                  <button @click.stop="toggleReaction(comment.id, 'sad')" 
                          class="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition text-lg"
                          :class="comment.userReaction === 'sad' ? 'bg-sky-100 dark:bg-sky-900' : ''"
                          title="難過">
                    <i class="fa-solid fa-face-sad-tear text-sky-500"></i>
                  </button>
                </div>
              </div>
            </div>
            
            <!-- Reply Button -->
            <button v-if="currentUser" @click="startReply(comment)" 
                    class="text-xs text-gray-400 hover:text-blue-500 transition flex items-center gap-1">
              <i class="fa-regular fa-comment"></i>
              <span>回覆</span>
            </button>
          </div>
          
          <!-- Reply Input -->
          <div v-if="replyingToId === comment.id" class="mt-3 pl-4 border-l-2 border-blue-400">
            <!-- Reply Markdown Toolbar -->
            <MarkdownToolbar 
              :textareaRef="replyTextarea" 
              v-model="replyContent" 
            />
            <textarea v-model="replyContent" 
                      ref="replyTextarea"
                      placeholder="輸入回覆..."
                      class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-b-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                      rows="2"></textarea>
            <div class="flex justify-between items-center mt-1">
              <div class="text-xs text-gray-400">支援 Markdown 語法</div>
              <div class="flex gap-2">
                <button @click="cancelReply" class="px-3 py-1 text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:opacity-80">取消</button>
                <button @click="submitReply()" :disabled="!replyContent.trim()" 
                        class="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">回覆</button>
              </div>
            </div>
          </div>
          
          <!-- Replies -->
          <div v-if="getReplies(comment.id).length > 0" class="mt-4 pl-6 border-l-2 border-gray-200 dark:border-gray-700 space-y-4">
            <div v-for="reply in getReplies(comment.id)" :key="reply.id" 
                 class="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <div class="flex items-start space-x-3">
                <!-- Reply Avatar and Name with Tooltip -->
                <div class="flex items-center gap-2 relative group shrink-0">
                  <div class="w-8 h-8 rounded-full flex items-center justify-center overflow-hidden text-white text-sm cursor-pointer"
                       :class="reply.user ? 'bg-blue-600' : 'bg-gray-500'">
                    <img v-if="reply.user?.avatar" :src="reply.user.avatar" class="w-full h-full object-cover" alt="">
                    <span v-else>{{ reply.user?.username?.charAt(0).toUpperCase() || '?' }}</span>
                  </div>
                  <!-- User Info Tooltip -->
                  <div v-if="reply.user" class="absolute left-0 top-full pt-2 hidden group-hover:block z-50">
                    <div class="bg-gray-200 dark:bg-gray-800 rounded-lg shadow-xl border border-gray-300 dark:border-gray-700" style="min-width: 200px;">
                      <div class="absolute top-0 left-4 w-3 h-3 bg-gray-200 dark:bg-gray-800 border-t border-l border-gray-300 dark:border-gray-700 transform rotate-45"></div>
                      <div class="relative z-10 p-3">
                        <div class="flex items-center space-x-3 mb-2">
                          <div class="w-10 h-10 rounded-full flex items-center justify-center overflow-hidden text-white text-sm"
                               :class="reply.user.avatar ? '' : 'bg-blue-600'">
                            <img v-if="reply.user.avatar" :src="reply.user.avatar" class="w-full h-full object-cover" alt="">
                            <span v-else>{{ reply.user.username?.charAt(0).toUpperCase() || '?' }}</span>
                          </div>
                          <div class="flex-1 min-w-0">
                            <div class="font-medium text-gray-800 dark:text-white text-sm truncate">
                              {{ reply.user.name || reply.user.username }}
                            </div>
                            <div class="text-xs text-gray-500 dark:text-gray-400 truncate">
                              @{{ reply.user.username }}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="flex-1 min-w-0">
                  <!-- Reply Header with Menu -->
                  <div class="flex items-center justify-between mb-1">
                    <div class="flex items-center gap-2">
                      <!-- Name with Tooltip -->
                      <div class="relative group/reply-user">
                        <span class="font-medium text-gray-800 dark:text-white text-sm cursor-pointer">
                          {{ reply.user?.name || reply.user?.username || '匿名' }}
                        </span>
                        <!-- User Info Tooltip on Name -->
                        <div v-if="reply.user" class="absolute left-0 top-full pt-2 hidden group-hover/reply-user:block z-50">
                          <div class="bg-gray-200 dark:bg-gray-800 rounded-lg shadow-xl border border-gray-300 dark:border-gray-700" style="min-width: 200px;">
                            <div class="absolute top-0 left-4 w-3 h-3 bg-gray-200 dark:bg-gray-800 border-t border-l border-gray-300 dark:border-gray-700 transform rotate-45"></div>
                            <div class="relative z-10 p-3">
                              <div class="flex items-center space-x-3 mb-2">
                                <div class="w-10 h-10 rounded-full flex items-center justify-center overflow-hidden text-white text-sm"
                                     :class="reply.user.avatar ? '' : 'bg-blue-600'">
                                  <img v-if="reply.user.avatar" :src="reply.user.avatar" class="w-full h-full object-cover" alt="">
                                  <span v-else>{{ reply.user.username?.charAt(0).toUpperCase() || '?' }}</span>
                                </div>
                                <div class="flex-1 min-w-0">
                                  <div class="font-medium text-gray-800 dark:text-white text-sm truncate">
                                    {{ reply.user.name || reply.user.username }}
                                  </div>
                                  <div class="text-xs text-gray-500 dark:text-gray-400 truncate">
                                    @{{ reply.user.username }}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                      <!-- Time (outside group) -->
                      <span class="text-xs text-gray-400 cursor-help" :title="formatFullTime(reply.createdAt)">{{ formatCommentTime(reply.createdAt) }}</span>
                    </div>
                    <!-- Reply Menu -->
                    <div v-if="canEditComment(reply) || canDeleteComment(reply)" class="relative">
                      <button @click="toggleCommentMenu(reply.id)" data-comment-menu
                          class="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                        <i class="fa-solid fa-ellipsis-vertical"></i>
                      </button>
                      <div v-if="openMenuId === reply.id" class="comment-menu-dropdown absolute right-0 top-full mt-1 w-32 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-50">
                        <button v-if="canEditComment(reply)" @click="startEditComment(reply)" 
                            class="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600 flex items-center">
                          <i class="fa-solid fa-pen mr-2"></i>編輯
                        </button>
                        <button v-if="canDeleteComment(reply)" @click="deleteComment(reply.id)" 
                            class="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-gray-100 dark:hover:bg-gray-600 flex items-center">
                          <i class="fa-solid fa-trash mr-2"></i>刪除
                        </button>
                      </div>
                    </div>
                  </div>
                  <!-- Edit Mode for Reply -->
                  <div v-if="editingCommentId === reply.id">
                    <!-- Edit Markdown Toolbar -->
                    <MarkdownToolbar 
                      :textareaRef="editTextarea" 
                      v-model="editCommentContent" 
                    />
                    <textarea v-model="editCommentContent" 
                      ref="editTextarea"
                      class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-b-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none transition-all"
                      rows="3"></textarea>
                    <div class="flex justify-between items-center mt-1">
                      <div class="text-xs text-gray-400">支援 Markdown 語法</div>
                      <div class="flex gap-2">
                        <button @click="cancelEditComment" class="px-3 py-1.5 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:opacity-80">取消</button>
                        <button @click="updateComment(reply.id)" class="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">儲存</button>
                      </div>
                    </div>
                  </div>
                  <!-- Reply Content -->
                  <div v-else class="text-gray-700 dark:text-gray-300 text-sm markdown-body comment-body" style="background-color: transparent;" v-html="renderCommentMarkdown(reply.content)"></div>
                  
                  <!-- Reply Reactions Display -->
                  <div v-if="Object.keys(reply.reactionCounts || {}).length > 0" class="flex items-center gap-2 mt-2 flex-wrap">
                    <span v-for="(count, type) in reply.reactionCounts" :key="type"
                          @click="toggleReaction(reply.id, type)"
                          class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs cursor-pointer transition"
                          :class="reply.userReaction === type 
                            ? 'bg-blue-100 dark:bg-blue-900 border border-blue-300 dark:border-blue-700' 
                            : 'bg-gray-100 dark:bg-gray-600 hover:bg-gray-200 dark:hover:bg-gray-500'">
                      <i :class="getReactionIcon(type)"></i>
                      <span>{{ count }}</span>
                    </span>
                  </div>
                  
                  <!-- Reply Action Buttons -->
                  <div class="flex items-center gap-3 mt-2">
                    <div class="relative group/reaction-reply">
                      <button @click="toggleReaction(reply.id, 'like')" class="text-xs text-gray-400 hover:text-blue-500 transition flex items-center gap-1 pb-2 -mb-2"
                              :class="reply.userReaction != null ? 'text-blue-500' : ''">
                        <i :class="reply.userReaction != null ? 'fa-solid fa-thumbs-up' : 'fa-regular fa-thumbs-up'"></i>
                        <span>讚</span>
                      </button>
                      <div class="absolute -left-3 bottom-full hidden group-hover/reaction-reply:block z-50 pb-1">
                        <div class="bg-white dark:bg-gray-800 rounded-full shadow-lg border border-gray-200 dark:border-gray-700 px-1 py-1 flex items-center gap-1">
                          <button @click.stop="toggleReaction(reply.id, 'like')" class="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition text-lg" :class="reply.userReaction === 'like' ? 'bg-blue-100 dark:bg-blue-900' : ''" title="讚">
                            <i class="fa-solid fa-thumbs-up text-blue-500"></i>
                          </button>
                          <button @click.stop="toggleReaction(reply.id, 'ok')" class="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition text-lg" :class="reply.userReaction === 'ok' ? 'bg-green-100 dark:bg-green-900' : ''" title="OK">
                            <i class="fa-solid fa-circle-check text-green-500"></i>
                          </button>
                          <button @click.stop="toggleReaction(reply.id, 'laugh')" class="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition text-lg" :class="reply.userReaction === 'laugh' ? 'bg-yellow-100 dark:bg-yellow-900' : ''" title="哈哈">
                            <i class="fa-solid fa-face-laugh-squint text-yellow-500"></i>
                          </button>
                          <button @click.stop="toggleReaction(reply.id, 'surprise')" class="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition text-lg" :class="reply.userReaction === 'surprise' ? 'bg-amber-100 dark:bg-amber-900' : ''" title="驚訝">
                            <i class="fa-solid fa-face-surprise text-amber-500"></i>
                          </button>
                          <button @click.stop="toggleReaction(reply.id, 'sad')" class="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition text-lg" :class="reply.userReaction === 'sad' ? 'bg-sky-100 dark:bg-sky-900' : ''" title="難過">
                            <i class="fa-solid fa-face-sad-tear text-sky-500"></i>
                          </button>
                        </div>
                      </div>
                    </div>
                    
                    <!-- Reply to Reply Button -->
                    <button v-if="currentUser" @click="startReply(reply, true, comment.id)" 
                            class="text-xs text-gray-400 hover:text-blue-500 transition flex items-center gap-1">
                      <i class="fa-regular fa-comment"></i>
                      <span>回覆</span>
                    </button>
                  </div>
                  
                  <!-- Reply Input (for replying to this reply) -->
                  <div v-if="replyingToId === reply.id" class="mt-3 pl-4 border-l-2 border-blue-400">
                    <!-- Reply Markdown Toolbar -->
                    <MarkdownToolbar 
                      :textareaRef="replyTextarea" 
                      v-model="replyContent" 
                    />
                    <textarea v-model="replyContent" 
                              ref="replyTextarea"
                              placeholder="輸入回覆..."
                              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-b-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                              rows="2"></textarea>
                    <div class="flex justify-between items-center mt-1">
                      <div class="text-xs text-gray-400">支援 Markdown 語法</div>
                      <div class="flex gap-2">
                        <button @click="cancelReply" class="px-3 py-1 text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:opacity-80">取消</button>
                        <button @click="submitReply()" :disabled="!replyContent.trim()" 
                                class="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">回覆</button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onMounted, onBeforeUnmount, inject } from 'vue'
import api from '@/composables/useApi'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/zh-tw'
import MarkdownIt from 'markdown-it'
import MarkdownToolbar from '@/components/common/MarkdownToolbar.vue'

dayjs.extend(relativeTime)
dayjs.locale('zh-tw')

const props = defineProps({
  noteId: {
    type: String,
    required: true
  },
  currentUser: {
    type: Object,
    default: null
  },
  isOwner: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['comment-added', 'comment-deleted'])

const showAlert = inject('showAlert', null)
const showConfirm = inject('showConfirm', null)

// Markdown instance for comments
const md = new MarkdownIt({
  html: false,
  breaks: true,
  linkify: true
})

// Comment state
const comments = ref([])
const newComment = ref('')
const commentPreviewMode = ref(false)
const submittingComment = ref(false)
const editingCommentId = ref(null)
const editCommentContent = ref('')
const openMenuId = ref(null)
const commentTextareaFocused = ref(false)
const commentTextarea = ref(null)
const sortBy = ref('time-asc')

// Reply state
const replyingToId = ref(null)
const replyingToParentId = ref(null)
const replyingToUser = ref(null)
const replyContent = ref('')
const replyTextarea = ref(null)
const replyTextareaFocused = ref(false)

// Edit state refs
const editTextarea = ref(null)
const editTextareaFocused = ref(false)

// Computed
const topLevelComments = computed(() => {
  const filtered = comments.value.filter(c => !c.parentId)
  
  if (sortBy.value === 'time-asc') {
    return filtered.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
  } else if (sortBy.value === 'time-desc') {
    return filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  } else if (sortBy.value === 'reactions') {
    // Sort by total reaction count (descending)
    const getReactionCount = (c) => {
      if (!c.reactionCounts) return 0
      return Object.values(c.reactionCounts).reduce((sum, count) => sum + count, 0)
    }
    return filtered.sort((a, b) => getReactionCount(b) - getReactionCount(a))
  }
  
  return filtered
})

const getReplies = (parentId) => {
  return comments.value
    .filter(c => c.parentId === parentId)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
}

// Methods
const renderCommentMarkdown = (text) => {
  if (!text) return ''
  return md.render(text)
}

const formatCommentTime = (time) => {
  return dayjs(time).fromNow()
}

const formatFullTime = (time) => {
  return dayjs(time).format('YYYY/MM/DD HH:mm')
}

const canEditComment = (comment) => {
  if (!props.currentUser) return false
  return comment.user?.id === props.currentUser.id
}

const canDeleteComment = (comment) => {
  if (!props.currentUser) return false
  return comment.user?.id === props.currentUser.id || props.isOwner
}

const toggleCommentMenu = (id) => {
  if (openMenuId.value === id) {
    openMenuId.value = null
  } else {
    openMenuId.value = id
  }
}

const closeCommentMenu = () => {
  openMenuId.value = null
}

const submitComment = async () => {
  if (!newComment.value.trim() || submittingComment.value) return
  submittingComment.value = true
  try {
    const comment = await api.addComment(props.noteId, newComment.value)
    comments.value.unshift(comment)
    newComment.value = ''
    commentPreviewMode.value = false
    emit('comment-added', comment)
  } catch (e) {
    showAlert?.('留言失敗', 'error')
  } finally {
    submittingComment.value = false
  }
}

const deleteComment = async (id) => {
  if (!await showConfirm?.('確定要刪除這則留言嗎？')) return
  try {
    await api.deleteComment(props.noteId, id)
    comments.value = comments.value.filter(c => c.id !== id && c.parentId !== id)
    emit('comment-deleted', id)
  } catch (e) {
    showAlert?.('刪除失敗', 'error')
  }
}

const startEditComment = (comment) => {
  editingCommentId.value = comment.id
  editCommentContent.value = comment.content
  openMenuId.value = null
}

const cancelEditComment = () => {
  editingCommentId.value = null
  editCommentContent.value = ''
}

const updateComment = async (id) => {
  if (!editCommentContent.value.trim()) return
  try {
    const updated = await api.updateComment(props.noteId, id, { content: editCommentContent.value })
    const idx = comments.value.findIndex(c => c.id === id)
    if (idx !== -1) {
      comments.value[idx] = updated
    }
    editingCommentId.value = null
    editCommentContent.value = ''
  } catch (e) {
    showAlert?.('更新留言失敗', 'error')
  }
}

// Reactions
const getReactionIcon = (type) => {
  const icons = {
    like: 'fa-solid fa-thumbs-up text-blue-500',
    ok: 'fa-solid fa-circle-check text-green-500',
    laugh: 'fa-solid fa-face-laugh-squint text-yellow-500',
    surprise: 'fa-solid fa-face-surprise text-amber-500',
    sad: 'fa-solid fa-face-sad-tear text-sky-500'
  }
  return icons[type] || 'fa-solid fa-heart text-gray-400'
}

const toggleReaction = async (commentId, type) => {
  if (!props.currentUser) {
    showAlert?.('請先登入才能使用反應功能', 'error')
    return
  }
  try {
    const result = await api.toggleCommentReaction(commentId, type)
    const comment = comments.value.find(c => c.id === commentId)
    if (comment) {
      if (!comment.reactionCounts) comment.reactionCounts = {}
      
      if (result.action === 'added') {
        if (comment.userReaction && comment.userReaction !== type && comment.reactionCounts[comment.userReaction]) {
          comment.reactionCounts[comment.userReaction]--
          if (comment.reactionCounts[comment.userReaction] <= 0) {
            delete comment.reactionCounts[comment.userReaction]
          }
        }
        comment.reactionCounts[type] = (comment.reactionCounts[type] || 0) + 1
        comment.userReaction = type
      } else if (result.action === 'removed') {
        comment.reactionCounts[type] = (comment.reactionCounts[type] || 1) - 1
        if (comment.reactionCounts[type] <= 0) {
          delete comment.reactionCounts[type]
        }
        comment.userReaction = null
      }
    }
  } catch (e) {
    showAlert?.('操作失敗', 'error')
  }
}

// Replies
const startReply = (comment, isReplyToReply = false, topLevelCommentId = null) => {
  if (isReplyToReply && topLevelCommentId) {
    replyingToId.value = comment.id
    replyingToParentId.value = topLevelCommentId
    replyingToUser.value = comment.user
    replyContent.value = `@${comment.user?.name || comment.user?.username || '用戶'} `
  } else {
    replyingToId.value = comment.id
    replyingToParentId.value = comment.id
    replyingToUser.value = null
    replyContent.value = ''
  }
}

const cancelReply = () => {
  replyingToId.value = null
  replyingToParentId.value = null
  replyingToUser.value = null
  replyContent.value = ''
}

const submitReply = async () => {
  if (!replyContent.value.trim() || !replyingToParentId.value) return
  try {
    const reply = await api.addComment(props.noteId, replyContent.value.trim(), replyingToParentId.value)
    comments.value.push(reply)
    replyingToId.value = null
    replyingToParentId.value = null
    replyingToUser.value = null
    replyContent.value = ''
  } catch (e) {
    showAlert?.('回覆失敗', 'error')
  }
}

// Textarea helpers
const autoGrowCommentTextarea = (e) => {
  const el = e.target
  el.style.height = 'auto'
  el.style.height = el.scrollHeight + 'px'
}

const handleCommentBlur = () => {
  commentTextareaFocused.value = false
}


// Load comments
const loadComments = async () => {
  try {
    comments.value = await api.getComments(props.noteId)
  } catch (e) {
    console.error('Failed to load comments:', e)
  }
}

// Click outside handler
const handleClickOutside = (e) => {
  if (!e.target.closest('[data-comment-menu]') && !e.target.closest('.comment-menu-dropdown')) {
    closeCommentMenu()
  }
}

onMounted(() => {
  loadComments()
  document.addEventListener('click', handleClickOutside)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside)
})

// Expose for parent component
defineExpose({
  loadComments,
  comments
})
</script>

<style scoped>
.comment-body :deep(p) {
  margin: 0;
}
</style>
