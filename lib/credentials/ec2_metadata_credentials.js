var AWS = require('../core');
require('../metadata_service');

/**
 * Represents credentials received from the metadata service on an EC2 instance.
 *
 * By default, this class will connect to the metadata service using
 * {AWS.MetadataService} and attempt to load any available credentials. If it
 * can connect, and credentials are available, these will be used with zero
 * configuration.
 *
 * This credentials class will by default timeout after 1 second of inactivity
 * and retry 3 times.
 * If your requests to the EC2 metadata service are timing out, you can increase
 * these values by configuring them directly:
 *
 * ```javascript
 * AWS.config.credentials = new AWS.EC2MetadataCredentials({
 *   httpOptions: { timeout: 5000 }, // 5 second timeout
 *   maxRetries: 10, // retry 10 times
 *   retryDelayOptions: { base: 200 } // see AWS.Config for information
 * });
 *
 * If your requests are timing out in connecting to the metadata service, such
 * as when testing on a development machine, you can use the connectTimeout
 * option, specified in milliseconds, which also defaults to 1 second.
 * ```
 *
 * @see AWS.Config.retryDelayOptions
 *
 * @!macro nobrowser
 */
AWS.EC2MetadataCredentials = AWS.util.inherit(AWS.Credentials, {
  constructor: function EC2MetadataCredentials(options) {
    AWS.Credentials.call(this);

    options = options ? AWS.util.copy(options) : {};
    options = AWS.util.merge(
      {maxRetries: this.defaultMaxRetries}, options);
    if (!options.httpOptions) options.httpOptions = {};
    options.httpOptions = AWS.util.merge(
      {timeout: this.defaultTimeout,
        connectTimeout: this.defaultConnectTimeout},
       options.httpOptions);

    this.metadataService = new AWS.MetadataService(options);
    this.metadata = {};
    this.originalExpiration = undefined;
  },

  /**
   * @api private
   */
  defaultTimeout: 1000,

   /**
   * @api private
   */
  defaultConnectTimeout: 1000,

  /**
   * @api private
   */
  defaultMaxRetries: 3,

  /**
   * @api private
   */
  staticStableRefreshTimeout: undefined,

  /**
   * Loads the credentials from the instance metadata service
   *
   * @callback callback function(err)
   *   Called when the instance metadata service responds (or fails). When
   *   this callback is called with no error, it means that the credentials
   *   information has been loaded into the object (as the `accessKeyId`,
   *   `secretAccessKey`, and `sessionToken` properties).
   *   @param err [Error] if an error occurred, this value will be filled
   * @see get
   */
  refresh: function refresh(callback) {
    this.coalesceRefresh(callback || AWS.util.fn.callback);
  },

  /**
   *
   */
  needsRefresh: function needsRefresh() {
    var self = this;
    if (self.staticStableRefreshTimeout) {
      return false;
    } else {
      // see AWS.util.inherit
      var superClass = self.constructor.__super__.prototype;
      return superClass.needsRefresh();
    }
  },

  /**
   * @api private
   * @param callback
   */
  load: function load(callback) {
    // var self = this;
    // var done = callback;
    // self.metadataService.loadCredentials(function(err, creds) {
    //   if (!err) {
    //     var currentTime = AWS.util.date.getDate();
    //     var expireTime = new Date(creds.Expiration);
    //     if (expireTime < currentTime) {
    //       err = AWS.util.error(
    //         new Error('EC2 Instance Metadata Serivce provided expired credentials'),
    //         { code: 'EC2MetadataCredentialsProviderFailure' }
    //       );
    //     } else {
    //       self.expired = false;
    //       self.metadata = creds;
    //       self.accessKeyId = creds.AccessKeyId;
    //       self.secretAccessKey = creds.SecretAccessKey;
    //       self.sessionToken = creds.Token;
    //       self.expireTime = expireTime;
    //     }
    //   }
    //   done();
    // });
    this.staticStableRefresh(callback);
  },

  staticStableRefresh: function staticStableRefresh(done) {
    var self = this;
    if (this.staticStableRefreshTimeout) {
      done();
    } else {
      self.metadataService.loadCredentials(function(err, creds) {
        if (!err) {
          var currentTime = AWS.util.date.getDate();
          var expireTime = new Date(creds.Expiration);
          if (expireTime < currentTime) {
            self.staticStableRefreshTimeout = setTimeout(function() {
              clearStaticStableRefreshTimeout();
              staticStableRefresh(done);
            }, self.getStaticStableRefreshTimeout());
          }
          self.setCredentials(creds);
          done();
        } else if (hasLoaded()) {
          // log extend expiration warning
          self.setCredentials();
          done();
        } else {
          done(err);
        }
      });
    }
  },

  getStaticStableRefreshTimeout: function getStaticStableRefreshTimeout() {
    // PASS
  },

  setCredentials: function setCredentials(creds) {
    var currentTime = AWS.util.date.getDate();
    var expireTime = new Date(creds.Expiration);
    if (expireTime < currentTime) {
      console.warn(''); // TODO
      this.originalExpiration = this.originalExpiration || this.expireTime;
      delete creds.Expiration;
    } else {
      this.staticStableRefreshTimeout = undefined;
      this.originalExpiration = undefined;
      this.expireTime = expireTime;
    }
    this.expired = false;
    this.metadata = creds;
    this.accessKeyId = creds.AccessKeyId;
    this.secretAccessKey = creds.SecretAccessKey;
    this.sessionToken = creds.Token;
  },

  clearStaticStableRefreshTimeout: function clearStaticStableRefreshTimeout() {
    clearTimeout(this.staticStableRefreshTimeout);
    this.staticStableRefreshTimeout = undefined;
  },

  hasLoaded: function hasLoaded() {
    return this.AccessKeyId && this.secretAccessKey;
  }
});
