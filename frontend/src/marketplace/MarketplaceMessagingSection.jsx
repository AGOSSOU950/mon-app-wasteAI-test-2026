import { memo } from "react"
import { useMarketplaceMessagingView } from "./MarketplaceContext"

const MarketplaceMessagingSection = memo(function MarketplaceMessagingSection() {
  const {
    styles,
    users,
    messagingUserId,
    setMessagingUserId,
    fetchConversations,
    loadingConversations,
    conversations,
    selectedConversationId,
    fetchConversationThread,
    conversationThread,
    loadingThread,
    replyText,
    setReplyText,
    sendReply
  } = useMarketplaceMessagingView()

  const { section, h3, hint, grid2, inp, btn, btnSecondary, subAccordion, subSummary, ownedCard, convBtn, convBtnActive, msgMine, msgOther } = styles

  return (
    <div style={section}>
      <h3 style={h3}>6) Boite de reception</h3>
      <p style={hint}>Selectionne un profil puis ouvre une conversation pour repondre rapidement.</p>
      <div style={grid2}>
        <select style={inp} value={messagingUserId} onChange={e => setMessagingUserId(e.target.value)}>
          <option value="">Selectionner un profil</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.nom} - {u.entreprise} ({u.type})</option>)}
        </select>
        <button style={btnSecondary} onClick={() => fetchConversations(messagingUserId)}>{loadingConversations ? "Chargement..." : "Actualiser conversations"}</button>
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        <details open style={subAccordion}>
          <summary style={subSummary}>Conversations</summary>
          <div style={ownedCard}>
            {!messagingUserId && <p style={{ color: "#60756a" }}>Choisis un profil pour voir ses conversations.</p>}
            {messagingUserId && conversations.length === 0 && !loadingConversations && <p style={{ color: "#60756a" }}>Aucune conversation.</p>}
            {conversations.map(conv => (
              <button key={conv.conversation_id} style={selectedConversationId === conv.conversation_id ? convBtnActive : convBtn} onClick={() => fetchConversationThread(conv.conversation_id, messagingUserId)}>
                <p style={{ margin: "0 0 4px", textAlign: "left", fontWeight: 700 }}>{conv.listing_titre}</p>
                <p style={{ margin: "0 0 4px", textAlign: "left", fontSize: 12, color: "#4f6359" }}>{conv.other_user_nom} - {conv.other_user_entreprise}</p>
                <p style={{ margin: 0, textAlign: "left", fontSize: 12, color: "#61756b" }}>{conv.last_message}</p>
              </button>
            ))}
          </div>
        </details>

        <details open style={subAccordion}>
          <summary style={subSummary}>Fil de discussion</summary>
          <div style={ownedCard}>
            {!conversationThread && <p style={{ color: "#60756a" }}>Selectionne une conversation.</p>}
            {loadingThread && <p style={{ color: "#60756a" }}>Chargement du fil...</p>}
            {conversationThread && !loadingThread && (
              <>
                <p style={{ marginTop: 0, color: "#315848" }}>Annonce: {conversationThread.listing_titre}</p>
                <div style={{ display: "grid", gap: 8, maxHeight: 240, overflowY: "auto", marginBottom: 10 }}>
                  {conversationThread.messages.map(msg => (
                    <div key={msg.id} style={msg.sender_id === messagingUserId ? msgMine : msgOther}>
                      <p style={{ margin: "0 0 4px", fontSize: 13 }}>{msg.contenu}</p>
                      <p style={{ margin: 0, fontSize: 11, color: "#5f6f67" }}>{new Date(msg.created_at).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
                <textarea style={{ ...inp, minHeight: 80 }} placeholder="Repondre..." value={replyText} onChange={e => setReplyText(e.target.value)} />
                <button style={btn} onClick={sendReply}>Envoyer reponse</button>
              </>
            )}
          </div>
        </details>
      </div>
    </div>
  )
})

export default MarketplaceMessagingSection

