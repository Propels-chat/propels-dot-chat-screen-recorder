import signIn from "./signIn";

const getCognitoToken = () => {
  return new Promise((resolve, reject) => {
    chrome.cookies.getAll(
      { 
        domain: process.env.DASHBOARD_URL
      }, 
      (cookies) => {
        if (chrome.runtime.lastError) {
          console.error('Error getting cookies:', chrome.runtime.lastError);
          reject(chrome.runtime.lastError);
          return;
        }

        const idToken = cookies.find(cookie => 
          cookie.name.includes('CognitoIdentityServiceProvider') && 
          cookie.name.endsWith('idToken')
        );

        if (idToken) {
          resolve({ idToken: idToken.value });
        } else {
          reject(new Error('NO_TOKEN_FOUND'));
        }
      }
    );
  });
};


// Function to upload a video to AWS S3
const saveToDrive = async (videoBlob, fileName, sendResponse) => {
  return new Promise(async (resolve, reject) => {
    try {
      const token = await getCognitoToken();
      // First, get the presigned URL from the API
      const getPresignedUrlResponse = await fetch(
        process.env.VIDEOS_API_ENDPOINT,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token.idToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            mimeType: "video/webm"
          }),
        }
      );

      // for dev environment only
      // const getPresignedUrlResponse = await fetch(
      //   "https://bsxnwsuxr3.execute-api.ap-southeast-1.amazonaws.com/dev/videos",
      //   {
      //     method: "POST",
      //     headers: {
      //       Authorization: `Bearer eyJraWQiOiJicG9hVVRua0tMSjRUUGN5TkhFcEZ1SUU4anc1bTVhUEE3ZmxuWnp1M0dRPSIsImFsZyI6IlJTMjU2In0.eyJzdWIiOiIwOTFhZDUxYy0xMDIxLTcwODEtOGZiZS0xNTVjYzVlODJiZDAiLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwiaXNzIjoiaHR0cHM6XC9cL2NvZ25pdG8taWRwLmFwLXNvdXRoZWFzdC0xLmFtYXpvbmF3cy5jb21cL2FwLXNvdXRoZWFzdC0xX2gxMkQ0U0VObSIsImNvZ25pdG86dXNlcm5hbWUiOiIwOTFhZDUxYy0xMDIxLTcwODEtOGZiZS0xNTVjYzVlODJiZDAiLCJvcmlnaW5fanRpIjoiNTZjYjI0YzMtZmJjNy00ODA2LWFkZWMtZTVjYTZlZDk2ODNhIiwiYXVkIjoiN2EwbjBzaHRsZmVjMnE1bDlhbjg2amdxajgiLCJldmVudF9pZCI6Ijg5MTQzMTE1LTkzMzctNDFhNS05NGU4LTY1MzFiZmI5NWU2NiIsInRva2VuX3VzZSI6ImlkIiwiYXV0aF90aW1lIjoxNzM2MjM3NzM4LCJleHAiOjE3MzYyNTIxMzgsImlhdCI6MTczNjIzNzczOCwianRpIjoiNTM0OTc5ZmYtM2ViZC00ZGU5LWEwNGEtYThiZTFmOTM4ZjYwIiwiZW1haWwiOiJ5YW9yb25hbGQxMzJAZ21haWwuY29tIn0.QbHJ8NKqvTRvRMN7U1EQLMwY9Ob6kYIKl8csWiwOJF_O3Nlg7vFeRSqTB6vVrsI0pl0cQD7ZnxZevQg0-T_xWX2_nbDrThTmCB-xeR1A5Fw0-i7Wv71TkLP5i8Ds_-niqpPqhjMEoKt6G7hDw0_uXuCl_yLvrHACFZ3FWk963TrJsnFvee1QFkyXeGM6vuKcI9SzWC0mUkY3Y8MafNPSlot7-kzY_VcPytGjqGcf6aQpi350LFCqBjpPS5qIGqkDQ_SvgatdWs2Jjhv0g6fx8l_B1peRrO1omnRprr_jaUp6CemJbaCwdr0K_y9Z16vDuZwK9YBQOGnWx7cAUIQG8g`,
      //       "Content-Type": "application/json",
      //     },
      //     body: JSON.stringify({
      //       mimeType: "video/webm"
      //     }),
      //   }
      // );

      if (!getPresignedUrlResponse.ok) {
        if (getPresignedUrlResponse.status === 401) {
          throw new Error('TOKEN_EXPIRED');
        }
        throw new Error(
          `Error getting presigned URL: ${getPresignedUrlResponse.status}`
        );
      }

      const responseData = await getPresignedUrlResponse.json();
      console.info("Full API Response Data:", JSON.stringify(responseData, null, 2));

      const presigned_url = responseData.presigned_url;
      const upload_path = responseData.upload_path;
      const video_id = responseData.video_id;

      console.info("S3 Upload URL:", presigned_url);
      console.info("S3 File Key:", upload_path);
      console.log("Video ID:", video_id);

      if (!presigned_url) {
        throw new Error("Failed to get presigned URL from response");
      }
    
      console.log(`type of responseData: ${typeof responseData}`);

    
      console.log(`presigned_url: ${presigned_url}`);
      // Upload the video to S3 using the presigned URL
      const uploadResponse = await fetch(presigned_url, {
        method: "PUT",
        headers: {
          "Content-Type": videoBlob.type,
        },
        body: videoBlob,
      });

      console.info("S3 Upload Response:", {
        status: uploadResponse.status,
        statusText: uploadResponse.statusText,
        headers: Object.fromEntries(uploadResponse.headers.entries())
      });

      if (!uploadResponse.ok) {
        throw new Error(`Error uploading to S3: ${uploadResponse.status}`);
      }

      // If upload is successful, resolve with success message
      const editorUrl = `https://${process.env.DASHBOARD_URL}/dashboard/${responseData.video_id}/edit`;
      chrome.tabs.create({
        url: editorUrl,
        active: true // Make this tab active since user will want to edit the video
      });
      resolve({ success: true, message: "Video uploaded successfully" });
    } catch (error) {
      console.error("Error in upload:", error);
      reject(error);
    }
  });
};

export { getCognitoToken };
export default saveToDrive;
