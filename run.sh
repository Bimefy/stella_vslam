docker exec stella-vslam sh -c "/stella_vslam_examples/build/run_video_slam 
-v /stella_vslam_examples/build/orb_vocab.fbow 
-m /tmp/stella-processor-P8BItP/360_locked.mp4 
-c /stella_vslam_examples/content/config.yml 
--no-sleep 
--eval-log-dir /stella_vslam_examples/result  
--temporal-mapping 
--wait-loop-ba 
--no-sleep 
--auto-term
