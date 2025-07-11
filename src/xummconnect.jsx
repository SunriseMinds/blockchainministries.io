import React, { useEffect, useState } from 'react'
import { Xumm } from 'xumm'

const xumm = new Xumm('<YOUR_XUMM_API_KEY>')

export default function XUMMConnect() {
  const [user, setUser] = useState(null)
  const [authUrl, setAuthUrl] = useState('')
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    const connect = async () => {
      try {
        const { uuid, next } = await xumm.authorize()
        setAuthUrl(next.always)
        xumm.on("success", async () => {
          const state = await xumm.state()
          setUser(state.me)
          setIsConnected(true)
        })
      } catch (error) {
        console.error('XUMM Connect Error:', error)
      }
    }
    connect()
  }, [])

  return (
    <div className="p-6 text-center">
      {!isConnected ? (
        <>
          <h2 className="text-xl font-bold mb-2">Connect Your XRPL Wallet</h2>
          {authUrl && (
            <a href={authUrl} target="_blank" rel="noopener noreferrer">
              <button className="bg-blue-600 text-white px-4 py-2 rounded shadow">Connect via XUMM</button>
            </a>
          )}
        </>
      ) : (
        <div className="text-green-700">
          <h2 className="text-xl font-bold">Wallet Connected ✅</h2>
          <p className="mt-2">XRP Address: {user?.account}</p>
        </div>
      )}
    </div>
  )
}
